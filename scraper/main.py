"""
Leila Scraper — FastAPI service

Endpoints:
  GET  /status          → status do serviço e proxies
  POST /scrape/all      → scrape todas as fontes ativas
  POST /scrape/{source} → scrape uma fonte específica
"""

import os
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Header
from dotenv import load_dotenv
from supabase import create_client, Client

# Load the scraper environment before importing source modules. Caixa reads
# SCRAPER_UFS at module initialization, so loading this afterwards silently
# reverted local runs to all 27 states.
load_dotenv()

from sources import SOURCES
from sources.base import ScrapedProperty, ScrapeResult, calculate_data_quality
from proxy.manager import proxy_count
from enrichment import enrich_properties
from scope import TARGET_CITY, TARGET_STATE, canonical_key, partition_scope

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
BATCH_SIZE = int(os.getenv("SCRAPER_BATCH_SIZE", "500"))
STALE_RUN_MINUTES = int(os.getenv("SCRAPER_STALE_RUN_MINUTES", "60"))


async def verify_secret(x_scraper_secret: str = Header(default="")):
    if not SCRAPER_SECRET or x_scraper_secret != SCRAPER_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _get_supabase() -> Client:
    return _supabase


def _property_row(prop: ScrapedProperty, now: str, content_hash: str) -> dict:
    """Converte um item normalizado para o contrato persistido."""
    return {
        "source_id": prop.source_id,
        "external_id": prop.external_id,
        "seller_id": prop.seller_id,
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
        "listing_url": (prop.raw_data or {}).get("source_url") or prop.edital_url,
        "edital_url": prop.edital_url,
        "photos": prop.photos,
        "auction_date": prop.auction_date.isoformat() if prop.auction_date else None,
        "auction_modality": prop.auction_modality,
        "auction_stage": prop.auction_stage,
        "auction_stages": prop.auction_stages or [],
        "area_classification": prop.area_classification,
        "raw_data": prop.raw_data,
        "bedrooms": prop.bedrooms,
        "bathrooms": prop.bathrooms,
        "parking_spots": prop.parking_spots,
        "is_occupied": prop.is_occupied,
        "property_condition": prop.property_condition,
        "useful_area_m2": prop.useful_area_m2,
        "features": prop.features or {},
        "content_hash": content_hash,
        "canonical_key": canonical_key(prop),
        "in_scope": True,
        "is_active": True,
        "availability_status": "available",
        "last_seen_at": now,
        "last_verified_at": now,
        "missing_count": 0,
        "data_quality_score": calculate_data_quality(prop),
        "scraped_at": now,
        "updated_at": now,
    }


def _content_hash(prop: ScrapedProperty) -> str:
    """Hash estável: timestamps e campos de execução ficam fora do hash."""
    payload = {
        "source_id": prop.source_id,
        "external_id": prop.external_id,
        "seller_id": prop.seller_id,
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
        "auction_stage": prop.auction_stage,
        "auction_stages": prop.auction_stages or [],
        "area_classification": prop.area_classification,
        "raw_data": prop.raw_data,
        "bedrooms": prop.bedrooms,
        "bathrooms": prop.bathrooms,
        "parking_spots": prop.parking_spots,
        "is_occupied": prop.is_occupied,
        "property_condition": prop.property_condition,
        "useful_area_m2": prop.useful_area_m2,
        "features": prop.features or {},
    }
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


async def _upsert_properties(
    properties: list[ScrapedProperty],
    scrape_start: datetime,
    run_id: str | None,
) -> ScrapeResult:
    """Persiste em lotes e contabiliza insert/update/unchanged corretamente."""
    # Uma fonte pode repetir o mesmo anúncio em páginas, filtros ou praças.
    # Deduplicar antes do staging evita conflito no lote e deixa a rejeição
    # visível no diagnóstico da rodada.
    discovered_count = len(properties)
    properties, out_of_scope = partition_scope(properties)
    unique_properties: dict[tuple[str, str], ScrapedProperty] = {}
    for prop in properties:
        unique_properties[(prop.source_id, prop.external_id)] = prop
    properties = list(unique_properties.values())
    result = ScrapeResult(
        total=len(properties),
        rejected=len(out_of_scope) + (discovered_count - len(out_of_scope) - len(properties)),
        run_id=run_id,
    )
    now = scrape_start.isoformat()

    for offset in range(0, len(properties), BATCH_SIZE):
        batch = properties[offset : offset + BATCH_SIZE]
        prepared = []
        for prop in batch:
            digest = _content_hash(prop)
            prepared.append((prop, digest, _property_row(prop, now, digest)))
        source_id = batch[0].source_id if batch else None
        external_ids = [prop.external_id for prop in batch]

        try:
            if run_id:
                staging_rows = [
                    {
                        "run_id": run_id,
                        "source_id": prop.source_id,
                        "external_id": prop.external_id,
                        "region": prop.state,
                        "city": prop.city,
                        "normalized_data": row,
                        "raw_data": prop.raw_data or {},
                        "content_hash": digest,
                        "observed_at": now,
                    }
                    for prop, digest, row in prepared
                ]
                _get_supabase().table("leila_ingestion_items").insert(staging_rows).execute()

            existing_response = (
                _get_supabase()
                .table("leila_properties")
                .select("id,external_id,content_hash")
                .eq("source_id", source_id)
                .in_("external_id", external_ids)
                .execute()
            )
            existing = {row["external_id"]: row for row in (existing_response.data or [])}

            response = (
                _get_supabase()
                .table("leila_properties")
                .upsert([row for _, _, row in prepared], on_conflict="source_id,external_id")
                .execute()
            )
            persisted = {row["external_id"]: row for row in (response.data or [])}

            snapshot_rows = []
            for prop, digest, row in prepared:
                previous = existing.get(prop.external_id)
                if previous is None:
                    result.inserted += 1
                elif previous.get("content_hash") == digest:
                    result.unchanged += 1
                else:
                    result.updated += 1

                if run_id and (previous is None or previous.get("content_hash") != digest):
                    persisted_row = persisted.get(prop.external_id)
                    if persisted_row:
                        snapshot_rows.append({
                            "property_id": persisted_row["id"],
                            "run_id": run_id,
                            "source_id": prop.source_id,
                            "content_hash": digest,
                            "snapshot_data": row,
                            "observed_at": now,
                        })

            if snapshot_rows:
                _get_supabase().table("leila_property_snapshots").upsert(
                    snapshot_rows,
                    on_conflict="property_id,content_hash",
                ).execute()
        except Exception as error:
            result.errors += len(batch)
            print(f"[upsert] Erro no lote {offset}:{offset + len(batch)} ({source_id}): {error}")

    return result


async def _reconcile_missing(source_id: str, verified_states: list[str], scrape_start: datetime) -> bool:
    """Reconcilia ausências apenas em regiões cuja coleta foi comprovadamente válida.

    Primeira ausência = suspect (continua visível com alerta). Segunda ausência
    consecutiva = unavailable. Assim uma oscilação do CSV não apaga oportunidades.
    """
    if not verified_states:
        return True

    try:
        response = _get_supabase().rpc("leila_reconcile_missing_scope", {
            "p_source_id": source_id,
            "p_verified_states": verified_states,
            "p_scrape_start": scrape_start.isoformat(),
            "p_scope_city": TARGET_CITY,
        }).execute()
        summary = (response.data or [{}])[0]
        suspect_count = int(summary.get("suspect_count") or 0)
        unavailable_count = int(summary.get("unavailable_count") or 0)
        if suspect_count or unavailable_count:
            print(f"[Scraper] {source_id}: {suspect_count} suspeitos, {unavailable_count} indisponíveis")
        return True
    except Exception as error:
        print(f"[Scraper] Reconciliação adiada para {source_id}: {error}")
        return False


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


def _update_coverage_observations(
    collector_source_id: str,
    properties: list[ScrapedProperty],
    observed_at: datetime,
) -> None:
    """Atualiza cobertura indireta somente com vendedor explicitamente observado."""
    try:
        relationships = (
            _get_supabase()
            .table("leila_source_coverages")
            .select("covered_source_id")
            .eq("collector_source_id", collector_source_id)
            .eq("active", True)
            .execute()
        )
        counts = Counter(prop.seller_id for prop in properties if prop.seller_id)
        for relationship in relationships.data or []:
            covered_source_id = relationship["covered_source_id"]
            count = int(counts.get(covered_source_id, 0))
            payload = {"observed_count": count, "updated_at": observed_at.isoformat()}
            if count > 0:
                payload["last_observed_at"] = observed_at.isoformat()
            (
                _get_supabase()
                .table("leila_source_coverages")
                .update(payload)
                .eq("collector_source_id", collector_source_id)
                .eq("covered_source_id", covered_source_id)
                .execute()
            )
    except Exception as error:
        print(f"[Scraper] Cobertura indireta não atualizada ({collector_source_id}): {error}")


def _start_run(source_id: str, collector_version: str, trigger_type: str = "scheduled") -> str | None:
    """Claims a source lease. The partial unique index makes this atomic."""
    try:
        cutoff = datetime.now(timezone.utc).timestamp() - STALE_RUN_MINUTES * 60
        stale_before = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
        _get_supabase().table("leila_ingestion_runs").update({
            "status": "stale",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "heartbeat_at": datetime.now(timezone.utc).isoformat(),
            "diagnostics": {"reason": "heartbeat_timeout"},
        }).eq("source_id", source_id).eq("status", "running").lt("heartbeat_at", stale_before).execute()

        attempted_at = datetime.now(timezone.utc).isoformat()
        _get_supabase().table("leila_sources").update({
            "last_attempted_at": attempted_at,
            "last_status": "running",
            "last_error": None,
            "collector_version": collector_version,
            "updated_at": attempted_at,
        }).eq("id", source_id).execute()
        resp = _get_supabase().table("leila_ingestion_runs").insert({
            "source_id": source_id,
            "status": "running",
            "trigger_type": trigger_type,
            "collector_version": collector_version,
            "heartbeat_at": attempted_at,
            "scope_state": TARGET_STATE,
            "scope_city": TARGET_CITY,
        }).execute()
        return resp.data[0]["id"] if resp.data else None
    except Exception as e:
        # 23505/unique conflict means another worker owns the source lease.
        print(f"[Scraper] Fonte {source_id} já possui execução ou não registrou início: {e}")
        return None


def _finish_run(run_id: str | None, status: str, result: ScrapeResult | None,
                verified: list[str], failed: list[str], error: str | None = None):
    if not run_id:
        return
    finished_at = datetime.now(timezone.utc)
    duration_ms = None
    if result and result.run_id:
        # run_id is not a timestamp; duration is filled by the caller when available.
        duration_ms = None
    payload = {
        "status": status,
        "finished_at": finished_at.isoformat(),
        "heartbeat_at": finished_at.isoformat(),
        "found_count": result.total if result else 0,
        "written_count": (result.inserted + result.updated) if result else 0,
        "unchanged_count": result.unchanged if result else 0,
        "rejected_count": result.rejected if result else 0,
        "error_count": (result.errors if result else 0) + len(failed) + (1 if error else 0),
        "verified_regions": verified,
        "failed_regions": failed,
        "diagnostics": {
            **({"error": error} if error else {}),
            **({"failed_regions_count": len(failed)} if failed else {}),
        },
    }
    try:
        _get_supabase().table("leila_ingestion_runs").update(payload).eq("id", run_id).execute()
    except Exception as e:
        print(f"[Scraper] Não foi possível concluir registro da coleta: {e}")

    source_id = None
    if run_id:
        try:
            run = _get_supabase().table("leila_ingestion_runs").select("source_id,started_at").eq("id", run_id).single().execute()
            source_id = run.data.get("source_id") if run.data else None
            if run.data and run.data.get("started_at"):
                started_raw = run.data["started_at"].replace("Z", "+00:00")
                # PostgREST may serialize UTC as `+00` instead of `+00:00`.
                if len(started_raw) >= 3 and started_raw[-3] in "+-" and started_raw[-2:].isdigit():
                    started_raw += ":00"
                started = datetime.fromisoformat(started_raw)
                duration_ms = max(0, int((finished_at - started).total_seconds() * 1000))
                _get_supabase().table("leila_ingestion_runs").update({"duration_ms": duration_ms}).eq("id", run_id).execute()
        except Exception as e:
            print(f"[Scraper] Não foi possível calcular duração da coleta: {e}")

    if source_id:
        source_error = error
        if not source_error and failed:
            source_error = f"Nenhuma coleta válida em {len(failed)} região(ões); resposta bloqueada, vazia ou inválida."
        source_payload = {
            "last_status": status,
            "last_found_count": result.total if result else 0,
            "last_written_count": (result.inserted + result.updated) if result else 0,
            "last_duration_ms": duration_ms,
            "last_error": source_error,
            "consecutive_failures": 0 if status == "success" else None,
            "updated_at": finished_at.isoformat(),
        }
        if status == "success":
            source_payload["last_successful_at"] = finished_at.isoformat()
            source_payload["last_scraped_at"] = finished_at.isoformat()
        else:
            # PostgREST does not support an atomic increment in an update body;
            # the health endpoint still records the exact run status.
            source_payload.pop("consecutive_failures", None)
        try:
            _get_supabase().table("leila_sources").update(source_payload).eq("id", source_id).execute()
        except Exception as e:
            print(f"[Scraper] Não foi possível atualizar saúde da fonte {source_id}: {e}")


def _heartbeat(run_id: str | None) -> None:
    if not run_id:
        return
    try:
        _get_supabase().table("leila_ingestion_runs").update({
            "heartbeat_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).eq("status", "running").execute()
    except Exception as e:
        print(f"[Scraper] Heartbeat não atualizado: {e}")


@app.get("/status", dependencies=[Depends(verify_secret)])
async def status():
    return {
        "service": "leila-scraper",
        "available_sources": {
            source_id: {
                "collector_version": getattr(source_class, "collector_version", "unknown"),
                "supports_regions": getattr(source_class, "supports_regions", False),
                "supports_details": getattr(source_class, "supports_details", False),
                "supports_documents": getattr(source_class, "supports_documents", False),
                "supports_photos": getattr(source_class, "supports_photos", False),
            }
            for source_id, source_class in SOURCES.items()
        },
        "proxy_count": proxy_count(),
        "proxy_rotation": os.getenv("PROXY_ROTATION", "false"),
        "scope": {"state": TARGET_STATE, "city": TARGET_CITY},
    }


@app.post("/scrape/all", dependencies=[Depends(verify_secret)])
async def scrape_all():
    # Get active sources from DB
    active = _get_supabase().table("leila_sources").select("id,implementation_status,collector_version").eq("active", True).execute()
    active_ids = [
        row["id"] for row in (active.data or [])
        if row["id"] in SOURCES and row.get("implementation_status") == "ready"
    ]

    all_results: dict[str, dict] = {}
    for source_id in active_ids:
        SourceClass = SOURCES[source_id]
        source = SourceClass()
        run_id = _start_run(source_id, getattr(source, "collector_version", "unknown"))
        if not run_id:
            all_results[source_id] = {"status": "skipped", "reason": "source_already_running"}
            continue
        scrape_start = datetime.now(timezone.utc)
        try:
            properties = await source.scrape()
            _heartbeat(run_id)
            result = await _upsert_properties(properties, scrape_start, run_id)
            _heartbeat(run_id)
            successful_regions = getattr(source, "successful_regions", None)
            verified = list(successful_regions) if successful_regions is not None else list({p.state for p in properties if p.state})
            failed = list(getattr(source, "failed_regions", []))
            # Se qualquer escrita falhou, não há como distinguir o anúncio
            # ausente daquele que foi visto mas não persistido. Não reconcilia.
            reconciliation_ok = True
            if verified and result.errors == 0 and getattr(source, "supports_reconciliation", False):
                reconciliation_ok = await _reconcile_missing(source_id, verified, scrape_start)
            if verified and result.errors == 0:
                scoped_properties, _ = partition_scope(properties)
                _update_coverage_observations(source_id, scoped_properties, datetime.now(timezone.utc))
            if verified:
                _refresh_neighborhood_profiles(verified)
            run_status = "failed" if not verified else ("partial" if failed or result.errors or not reconciliation_ok else "success")
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
    run_id = _start_run(source_id, getattr(source, "collector_version", "unknown"), "manual")
    if not run_id:
        raise HTTPException(status_code=409, detail=f"Fonte '{source_id}' já possui uma coleta em andamento")

    print(f"[Scraper] Starting {source_id}...")
    scrape_start = datetime.now(timezone.utc)
    try:
        properties = await source.scrape()
        _heartbeat(run_id)
        result = await _upsert_properties(properties, scrape_start, run_id)
        _heartbeat(run_id)
        successful_regions = getattr(source, "successful_regions", None)
        verified = list(successful_regions) if successful_regions is not None else list({p.state for p in properties if p.state})
        failed = list(getattr(source, "failed_regions", []))
        reconciliation_ok = True
        if verified and result.errors == 0 and getattr(source, "supports_reconciliation", False):
            reconciliation_ok = await _reconcile_missing(source_id, verified, scrape_start)
        if verified and result.errors == 0:
            scoped_properties, _ = partition_scope(properties)
            _update_coverage_observations(source_id, scoped_properties, datetime.now(timezone.utc))
        if verified:
            _refresh_neighborhood_profiles(verified)
        run_status = "failed" if not verified else ("partial" if failed or result.errors or not reconciliation_ok else "success")
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
