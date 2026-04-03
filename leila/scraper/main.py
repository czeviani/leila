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

from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
from supabase import create_client, Client

from sources import SOURCES
from sources.base import ScrapedProperty, ScrapeResult
from proxy.manager import proxy_count

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


def _get_supabase() -> Client:
    return _supabase


async def _upsert_properties(properties: list[ScrapedProperty]) -> ScrapeResult:
    result = ScrapeResult(total=len(properties))

    for prop in properties:
        row = {
            "source_id": prop.source_id,
            "external_id": prop.external_id,
            "title": prop.title,
            "address": prop.address,
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
            "raw_data": prop.raw_data,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            response = _get_supabase().table("leila_properties").upsert(
                row,
                on_conflict="source_id,external_id"
            ).execute()

            if response.data:
                # Supabase upsert returns data — check if insert vs update
                result.inserted += 1  # simplified: count as inserted
        except Exception as e:
            print(f"[upsert] Erro para {prop.external_id}: {e}")
            result.errors += 1

    return result


async def _update_source_timestamp(source_id: str):
    _get_supabase().table("leila_sources").update({
        "last_scraped_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", source_id).execute()


@app.get("/status")
async def status():
    return {
        "service": "leila-scraper",
        "available_sources": list(SOURCES.keys()),
        "proxy_count": proxy_count(),
        "proxy_rotation": os.getenv("PROXY_ROTATION", "false"),
    }


@app.post("/scrape/all")
async def scrape_all():
    # Get active sources from DB
    active = _get_supabase().table("leila_sources").select("id").eq("active", True).execute()
    active_ids = [row["id"] for row in (active.data or []) if row["id"] in SOURCES]

    all_results: dict[str, dict] = {}
    for source_id in active_ids:
        SourceClass = SOURCES[source_id]
        source = SourceClass()
        try:
            properties = await source.scrape()
            result = await _upsert_properties(properties)
            await _update_source_timestamp(source_id)
            all_results[source_id] = result.__dict__
        except Exception as e:
            print(f"[Scraper] Erro em {source_id}: {e}")
            all_results[source_id] = {"error": str(e)}

    return all_results


@app.post("/scrape/{source_id}")
async def scrape_source(source_id: str):
    if source_id not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found")

    SourceClass = SOURCES[source_id]
    source = SourceClass()

    print(f"[Scraper] Starting {source_id}...")
    properties = await source.scrape()

    result = await _upsert_properties(properties)
    await _update_source_timestamp(source_id)

    print(f"[Scraper] {source_id} done: {result}")
    return result.__dict__


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
