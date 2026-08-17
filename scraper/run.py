"""Executor standalone que reutiliza exatamente o pipeline da API FastAPI.

Não mantenha lógica de persistência aqui: GitHub Actions e o serviço precisam
ter a mesma semântica de qualidade, disponibilidade e observabilidade.
"""
import asyncio

from supabase import create_client

import main as scraper_app


async def run() -> None:
    scraper_app._supabase = create_client(
        scraper_app.SUPABASE_URL,
        scraper_app.SUPABASE_SERVICE_KEY,
    )
    results = await scraper_app.scrape_all()
    print(f"[Leila Radar] Coleta concluída: {results}")


if __name__ == "__main__":
    asyncio.run(run())
