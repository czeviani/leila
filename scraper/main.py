"""
Leila Scraper — FastAPI service

Endpoints:
  GET  /status          → status do serviço e proxies
  POST /scrape/all      → scrape todas as fontes ativas
  POST /scrape/{source} → scrape uma fonte específica
"""

import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Header
from dotenv import load_dotenv
from supabase import create_client, Client

from sources import SOURCES
from sources.base import ScrapedProperty, ScrapeResult, calculate_data_quality
from proxy.manager import proxy_count
from enrichment import enrich_properties

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

_supabase: Client = None  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _supabase
    _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print(f"[Leila Scraper] Supabase conectado. Proxies disponíveis: {proxy_count()}")
    yield


app = FastAPI(title="Leila Scraper", lifespan=lifespan)

SCRAPER_SECRET = os.environ.get("SCRAPER_SECRET", "")


async def verify_secret(x_scraper_secret: str = Header(default="")):
    if not SCRAPER_SECRET or x_scraper_secret != SCRAPER_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _get_supabase() -> Client:
    return _supabase


async def _upsert_properties(properties: list[ScrapedProperty], scrape_start: datetime) -> ScrapeResult:
    result = ScrapeResult(total=len(properties))
    now = scrape_start.isoformat()

    for prop in properties:
        row = {
            "source_id": prop.source_id,
            "external_id": prop.external_id,
            "title": prop.title,
            "address": prop.address,
            "neighborhood": prop.neighborhood,
            "city": prop.city,
            "state": prop.state,
            "zip_code": prop.zip_code,
            "property_type": prop.property_type,
            "area_m2": prop.area_m2,
            "appraised_value": prop.appraised_value,
            "auction_price": prop.auction_price,
            "discount_pct": prop.discount_pct,
            "description": prop.description,
            "edital_url": prop.edital_url,
            "photos": prop.photos,
            "auction_date": prop.auction_date.isoformat() if prop.auction_date else None,
            "auction_modality": prop.auction_modality,
            "area_classification": prop.area_classification,
            "raw_data": prop.raw_data,
            # Enriquecimento heurístico (Camada 1)
            "bedrooms": prop.bedrooms,
            "bathrooms": prop.bathrooms,
            "parking_spots": prop.parking_spots,
            "is_occupied": prop.is_occupied,
            "property_condition": prop.property_condition,
            "useful_area_m2": prop.useful_area_m2,
            "features": prop.features or {},
            "is_active": True,
            "availability_status": "available",
            "last_seen_at": now,
            "last_verified_at": now,
            "missing_count": 0,
            "data_quality_score": calculate_data_quality(prop),
            "scraped_at": now,
            "updated_at": now,
        }

        try:
            response = _get_supabase().table("leila_properties").upsert(
                row,
                on_conflict="source_id,external_id"
            ).execute()

            if response.data:
                result.inserted += 1
        except Exception as e:
            print(f"[upsert] Erro para {prop.external_id}: {e}")
            result.errors += 1

    return result


async def _reconcile_missing(source_id: str, verified_states: list[str], scrape_start: datetime):
    """Reconcilia ausências apenas em regiões cuja coleta foi comprovadamente válida.

    Primeira ausência = suspect (continua visível com alerta). Segunda ausência
    consecutiva = unavailable. Assim uma oscilação do CSV não apaga oportunidades.
    """
    if not verified_states:
        return

    response = _get_supabase().rpc("leila_reconcile_missing", {
        "p_source_id": source_id,
        "p_verified_states": verified_states,
        "p_scrape_start": scrape_start.isoformat(),
    }).execute()
    summary = (response.data or [{}])[0]
    suspect_count = int(summary.get("suspect_count") or 0)
    unavailable_count = int(summary.get("unavailable_count") or 0)
    if suspect_count or unavailable_count:
        print(f"[Scraper] {source_id}: {suspect_count} suspeitos, {unavailable_count} indisponíveis")


def _refresh_neighborhood_profiles(verified_states: list[str]):
    """Recalcula uma vez por rodada apenas os mercados realmente verificados."""
    if not verified_states:
        return
    try:
        response = _get_supabase().rpc("leila_refresh_neighborhood_profiles", {
            "p_states": sorted(set(verified_states)),
        }).execute()
        summary = response.data or {}
        print(f"[Scraper] Perfis de bairro atualizados: {summary}")
    except Exception as e:
        # O perfil analítico não pode invalidar uma coleta que já foi persistida.
        print(f"[Scraper] Não foi possível atualizar perfis de bairro: {e}")


def _start_run(source_id: str) -> str | None:
    try:
        resp = _get_supabase().table("leila_ingestion_runs").insert({
            "source_id": source_id, "status": "running"
        }).execute()
        return resp.data[0]["id"] if resp.data else None
    except Exception as e:
        print(f"[Scraper] Não foi possível registrar início da coleta: {e}")
        return None


def _finish_run(run_id: str | None, status: str, result: ScrapeResult | None,
                verified: list[str], failed: list[str], error: str | None = None):
    if not run_id:
        return
    payload = {
        "status": status,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "found_count": result.total if result else 0,
        "written_count": result.inserted if result else 0,
        "error_count": (result.errors if result else 0) + (1 if error else 0),
        "verified_regions": verified,
        "failed_regions": failed,
        "diagnostics": {"error": error} if error else {},
    }
    try:
        _get_supabase().table("leila_ingestion_runs").update(payload).eq("id", run_id).execute()
    except Exception as e:
        print(f"[Scraper] Não foi possível concluir registro da coleta: {e}")


async def _update_source_timestamp(source_id: str):
    _get_supabase().table("leila_sources").update({
        "last_scraped_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", source_id).execute()


@app.get("/status", dependencies=[Depends(verify_secret)])
async def status():
    return {
        "service": "leila-scraper",
        "available_sources": list(SOURCES.keys()),
        "proxy_count": proxy_count(),
        "proxy_rotation": os.getenv("PROXY_ROTATION", "false"),
    }


@app.post("/scrape/all", dependencies=[Depends(verify_secret)])
async def scrape_all():
    # Get active sources from DB
    active = _get_supabase().table("leila_sources").select("id").eq("active", True).execute()
    active_ids = [row["id"] for row in (active.data or []) if row["id"] in SOURCES]

    all_results: dict[str, dict] = {}
    for source_id in active_ids:
        SourceClass = SOURCES[source_id]
        source = SourceClass()
        run_id = _start_run(source_id)
        scrape_start = datetime.now(timezone.utc)
        try:
            properties = await source.scrape()
            result = await _upsert_properties(properties, scrape_start)
            successful_regions = getattr(source, "successful_regions", None)
            verified = list(successful_regions) if successful_regions is not None else list({p.state for p in properties if p.state})
            failed = list(getattr(source, "failed_regions", []))
            # Se qualquer escrita falhou, não há como distinguir o anúncio
            # ausente daquele que foi visto mas não persistido. Não reconcilia.
            if verified and result.errors == 0:
                await _reconcile_missing(source_id, verified, scrape_start)
            if verified:
                _refresh_neighborhood_profiles(verified)
            run_status = "failed" if not verified else ("partial" if failed or result.errors else "success")
            if run_status == "success":
                await _update_source_timestamp(source_id)
            _finish_run(run_id, run_status, result, verified, failed)
            all_results[source_id] = {
                **result.__dict__,
                "status": run_status,
                "verified_regions": verified,
                "failed_regions": failed,
            }
        except Exception as e:
            print(f"[Scraper] Erro em {source_id}: {e}")
            _finish_run(run_id, "failed", None, [], [], str(e))
            all_results[source_id] = {"status": "failed", "error": str(e)}

    if not all_results:
        raise HTTPException(status_code=503, detail="Nenhuma fonte ativa implementada")
    if all(result.get("status") == "failed" for result in all_results.values()):
        raise HTTPException(status_code=502, detail={
            "message": "Nenhuma fonte produziu uma coleta válida",
            "results": all_results,
        })
    return all_results


@app.post("/scrape/{source_id}", dependencies=[Depends(verify_secret)])
async def scrape_source(source_id: str, background_tasks: BackgroundTasks):
    if source_id not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found")

    SourceClass = SOURCES[source_id]
    source = SourceClass()
    run_id = _start_run(source_id)

    print(f"[Scraper] Starting {source_id}...")
    scrape_start = datetime.now(timezone.utc)
    try:
        properties = await source.scrape()
        result = await _upsert_properties(properties, scrape_start)
        successful_regions = getattr(source, "successful_regions", None)
        verified = list(successful_regions) if successful_regions is not None else list({p.state for p in properties if p.state})
        failed = list(getattr(source, "failed_regions", []))
        if verified and result.errors == 0:
            await _reconcile_missing(source_id, verified, scrape_start)
        if verified:
            _refresh_neighborhood_profiles(verified)
        run_status = "failed" if not verified else ("partial" if failed or result.errors else "success")
        if run_status == "success":
            await _update_source_timestamp(source_id)
        _finish_run(run_id, run_status, result, verified, failed)
        if run_status == "failed":
            raise HTTPException(status_code=502, detail="Nenhuma região produziu uma coleta válida")
    except HTTPException:
        raise
    except Exception as e:
        _finish_run(run_id, "failed", None, [], [], str(e))
        raise HTTPException(status_code=502, detail=f"Falha na coleta de {source_id}") from e

    print(f"[Scraper] {source_id} done: {result}")

    # Dispara enriquecimento IA em background (não bloqueia a resposta)
    if os.getenv("ANTHROPIC_API_KEY"):
        background_tasks.add_task(_run_enrichment)
    else:
        print("[Scraper] ANTHROPIC_API_KEY não configurado — pulando enriquecimento IA")

    return {
        **result.__dict__,
        "status": run_status,
        "verified_regions": verified,
        "failed_regions": failed,
    }


def _run_enrichment():
    """Executa o enriquecimento IA em background (síncrono → thread pool)."""
    try:
        stats = enrich_properties(_get_supabase())
        print(f"[Enrichment] Concluído: {stats}")
    except Exception as e:
        print(f"[Enrichment] Erro no background: {e}")


@app.post("/enrich", dependencies=[Depends(verify_secret)])
async def enrich_endpoint(dry_run: bool = False):
    """
    Enriquece propriedades sem dados estruturados usando IA (Haiku).

    - dry_run=true: processa mas não salva no banco (para testes)
    - Só processa properties com bedrooms=NULL e ai_enriched_at=NULL
    """
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY não configurado")

    stats = enrich_properties(_get_supabase(), dry_run=dry_run)
    return stats


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
