"""
Script standalone para rodar o scraper sem o servidor FastAPI.
Usado pelo GitHub Actions e por triggers manuais.
"""
import asyncio
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

from sources import SOURCES
from sources.base import ScrapedProperty, ScrapeResult

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]


async def upsert_properties(supabase, properties: list[ScrapedProperty]) -> ScrapeResult:
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
            supabase.table("leila_properties").upsert(
                row, on_conflict="source_id,external_id"
            ).execute()
            result.inserted += 1
        except Exception as e:
            print(f"  [erro] {prop.external_id}: {e}")
            result.errors += 1
    return result


async def update_source_timestamp(supabase, source_id: str):
    supabase.table("leila_sources").update({
        "last_scraped_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", source_id).execute()


async def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Buscar fontes ativas no banco
    active = supabase.table("leila_sources").select("id").eq("active", True).execute()
    active_ids = [row["id"] for row in (active.data or []) if row["id"] in SOURCES]

    if not active_ids:
        print("Nenhuma fonte ativa encontrada.")
        return

    print(f"Fontes ativas: {active_ids}")
    total_props = 0

    for source_id in active_ids:
        print(f"\n=== {source_id} ===")
        SourceClass = SOURCES[source_id]
        source = SourceClass()
        try:
            properties = await source.scrape()
            result = await upsert_properties(supabase, properties)
            await update_source_timestamp(supabase, source_id)
            total_props += result.inserted
            print(f"  total={result.total} inserted={result.inserted} errors={result.errors}")
        except Exception as e:
            print(f"  ERRO: {e}")

    print(f"\nFinalizado. {total_props} imóveis processados.")


if __name__ == "__main__":
    asyncio.run(main())
