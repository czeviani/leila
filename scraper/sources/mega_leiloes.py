"""Coletor público do catálogo de imóveis da Mega Leilões.

O catálogo é HTML server-rendered e possui paginação estável (`?imoveis=N`).
O coletor deliberadamente ingere apenas cartões de imóveis (`/imoveis/`), não
cartões de eventos (`/ML...`), evitando transformar um leilão inteiro em um
imóvel falso.
"""

import asyncio
import os
import re
from datetime import datetime
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

from bs4 import BeautifulSoup

from .base import BaseSource, ScrapedProperty
from .caixa import _parse_brl, _parse_area
from .marketplace import detect_seller
from scope import is_target_location


SOURCE_ID = "mega_leiloes"
BASE_URL = "https://www.megaleiloes.com.br"
PAGE_URL = f"{BASE_URL}/?imoveis={{page}}"

_BANK_SELLERS = {
    "leilao-banco-bradesco.png": "bradesco",
    "leilao-banco-itau.png": "itau",
    "leilao-banco-santander.png": "santander",
    "leilao-banco-caixa.png": "caixa",
    "leilao-megaleiloes.png": "mega_leiloes",
}


def _canonical_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def _parse_date(text: str) -> Optional[datetime]:
    match = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text or "")
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%d/%m/%Y")
    except ValueError:
        return None


def _property_type(title: str) -> Optional[str]:
    normalized = (title or "").lower()
    for needle, label in (
        ("apartamento", "apartamento"),
        ("casa", "casa"),
        ("terreno", "terreno"),
        ("lote", "terreno"),
        ("galpão", "galpão"),
        ("galpao", "galpão"),
        ("prédio", "prédio"),
        ("predio", "prédio"),
        ("sala", "sala"),
        ("loja", "loja"),
        ("fazenda", "fazenda"),
        ("sítio", "sítio"),
        ("sitio", "sítio"),
    ):
        if needle in normalized:
            return label
    return None


def _seller_id(card) -> Optional[str]:
    image = card.select_one(".card-bank img")
    filename = (image.get("src") or "").rsplit("/", 1)[-1].lower() if image else ""
    return _BANK_SELLERS.get(filename) or detect_seller(
        filename,
        image.get("alt") if image else None,
        card.get_text(" ", strip=True),
    )


class MegaLeiloesSource(BaseSource):
    source_id = SOURCE_ID
    supports_reconciliation = True
    collector_version = "mega-leiloes-1.1.0"
    supports_regions = True
    supports_details = False
    supports_documents = False
    supports_photos = True

    def __init__(self, max_pages: Optional[int] = None):
        self.max_pages = max_pages or int(os.getenv("MEGA_MAX_PAGES", "30"))
        self.successful_regions: list[str] = []
        self.failed_regions: list[str] = []

    @staticmethod
    def _parse_page(html: str) -> tuple[list[ScrapedProperty], int]:
        soup = BeautifulSoup(html, "html.parser")
        properties: list[ScrapedProperty] = []
        for card in soup.select("div.card"):
            link = card.select_one('a.card-title[href*="/imoveis/"]')
            number = card.select_one(".card-number")
            if not link or not number:
                continue
            external_id = number.get_text(" ", strip=True).upper()
            if not re.fullmatch(r"[A-Z]\d+", external_id):
                continue

            title = link.get_text(" ", strip=True)
            price_node = card.select_one(".card-price, .card-instance-value")
            auction_price = _parse_brl(price_node.get_text(" ", strip=True)) if price_node else None
            if not auction_price:
                continue

            locality = card.select_one(".card-locality")
            locality_text = locality.get_text(" ", strip=True) if locality else ""
            city, state = None, None
            locality_match = re.match(r"(.+?),\s*([A-Z]{2})$", locality_text)
            if locality_match:
                city, state = locality_match.group(1).strip().title(), locality_match.group(2)

            date_node = card.select_one(".card-instance-info")
            auction_date = _parse_date(date_node.get_text(" ", strip=True) if date_node else "")
            modality_node = card.select_one(".card-instance-title")
            modality = modality_node.get_text(" ", strip=True) if modality_node else None
            instances = []
            for instance in card.select(".card-instance-info .instance"):
                instance_text = instance.get_text(" ", strip=True)
                instance_date = _parse_date(instance_text)
                value_node = instance.select_one(".card-instance-value")
                instances.append({
                    "label": instance_text,
                    "date": instance_date.date().isoformat() if instance_date else None,
                    "price": _parse_brl(value_node.get_text(" ", strip=True)) if value_node else None,
                })
            image = card.select_one("a.card-image")
            image_url = None
            if image:
                image_url = image.get("data-bg")
                if not image_url:
                    image_url = re.search(r"url\\?\(([^)]+)\)", image.get("style") or "")
                    image_url = image_url.group(1).strip(" '\"") if image_url else None

            area_match = re.search(r"([\d.]+(?:,[\d]+)?)\s*m²", title, re.I)
            area = _parse_area(area_match.group(1)) if area_match else None
            detail_url = _canonical_url(link.get("href", ""))
            event_link = card.select_one(".card-gavet-link")
            status_node = card.select_one(".card-status")
            properties.append(
                ScrapedProperty(
                    source_id=SOURCE_ID,
                    external_id=external_id,
                    title=title,
                    auction_price=auction_price,
                    seller_id=_seller_id(card),
                    address=title,
                    city=city,
                    state=state,
                    property_type=_property_type(title),
                    area_m2=area,
                    description=card.get_text(" ", strip=True),
                    edital_url=detail_url,
                    photos=[image_url] if image_url else [],
                    auction_date=auction_date.date() if auction_date else None,
                    auction_modality=modality,
                    raw_data={
                        "source_url": detail_url,
                        "event_url": _canonical_url(event_link.get("href", "")) if event_link else None,
                        "seller_evidence": _seller_id(card),
                        "status": status_node.get_text(" ", strip=True) if status_node else None,
                        "instances": instances,
                    },
                )
            )

        summary = soup.select_one(".summary")
        pages = 1
        page_match = re.search(r"Página\s+\d+\s+de\s+(\d+)", summary.get_text(" ", strip=True) if summary else "")
        if page_match:
            pages = int(page_match.group(1))
        return properties, pages

    async def scrape(self) -> list[ScrapedProperty]:
        properties: list[ScrapedProperty] = []
        async with self._build_client() as client:
            first_page = await self._get(client, PAGE_URL.format(page=1))
            first_properties, total_pages = self._parse_page(first_page.text)
            properties.extend(first_properties)
            for page in range(2, min(total_pages, self.max_pages) + 1):
                await asyncio.sleep(float(os.getenv("MEGA_PAGE_DELAY", "0.5")))
                try:
                    response = await self._get(client, PAGE_URL.format(page=page))
                    page_properties, _ = self._parse_page(response.text)
                    properties.extend(page_properties)
                except Exception as error:
                    self.failed_regions.append(f"page:{page}")
                    print(f"[Mega Leilões] Página {page} falhou: {error}")

        properties = [prop for prop in properties if is_target_location(prop.state, prop.city)]
        self.successful_regions = ["SP"] if properties and not self.failed_regions else []
        if not properties:
            self.failed_regions.append("catalog")
        print(f"[Mega Leilões] Total São Paulo/SP: {len(properties)} imóveis")
        return properties
