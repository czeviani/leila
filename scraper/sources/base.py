"""
Base class para todos os scrapers de leilão.
"""

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from proxy.manager import get_proxy


DEFAULT_HEADERS = {
    "User-Agent": os.getenv(
        "USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

REQUEST_TIMEOUT = 30.0


@dataclass
class ScrapedProperty:
    source_id: str
    external_id: str
    title: str
    auction_price: float
    seller_id: Optional[str] = None

    address: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    property_type: Optional[str] = None
    area_m2: Optional[float] = None
    appraised_value: Optional[float] = None
    discount_pct: Optional[float] = None
    description: Optional[str] = None
    edital_url: Optional[str] = None
    photos: list[str] = field(default_factory=list)
    auction_date: Optional[date] = None
    auction_modality: Optional[str] = None
    auction_stage: Optional[str] = None
    auction_stages: list[dict] = field(default_factory=list)
    area_classification: Optional[str] = None  # nobre | intermediário | popular | comunidade | indefinido
    raw_data: dict = field(default_factory=dict)

    # Campos de enriquecimento (heurística — Camada 1)
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    parking_spots: Optional[int] = None
    is_occupied: Optional[bool] = None
    property_condition: Optional[str] = None  # precario | habitavel | reformado | novo
    useful_area_m2: Optional[float] = None
    features: dict = field(default_factory=dict)


@dataclass
class ScrapeResult:
    total: int = 0
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    rejected: int = 0
    errors: int = 0
    run_id: Optional[str] = None


def calculate_data_quality(prop: ScrapedProperty) -> int:
    """Score explicável de completude (0-100), sem inferir veracidade."""
    score = 35  # identificador, fonte, título e preço são obrigatórios
    score += 5 if prop.address else 0
    score += 5 if prop.neighborhood else 0
    score += 10 if prop.city and prop.state else 0
    score += 10 if prop.area_m2 or prop.useful_area_m2 else 0
    score += 10 if prop.appraised_value and prop.discount_pct is not None else 0
    score += 8 if prop.edital_url else 0
    score += 7 if prop.auction_modality else 0
    score += 5 if prop.description else 0
    score += 5 if prop.auction_date else 0
    return min(score, 100)


class BaseSource(ABC):
    source_id: str
    collector_version: str = "1.0.0"
    supports_regions: bool = True
    supports_details: bool = False
    supports_documents: bool = False
    supports_photos: bool = False
    # Only full, stable catalogs may expire records that disappear. Search
    # pages and rotating marketplaces must never infer absence from one run.
    supports_reconciliation: bool = False

    def _build_client(self) -> httpx.AsyncClient:
        proxy = get_proxy()
        return httpx.AsyncClient(
            headers=DEFAULT_HEADERS,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
            proxy=proxy,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
    )
    async def _get(self, client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
        response = await client.get(url, **kwargs)
        response.raise_for_status()
        return response

    @abstractmethod
    async def scrape(self) -> list[ScrapedProperty]:
        """Executa o scraping e retorna lista de imóveis."""
        ...
