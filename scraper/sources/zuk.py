"""Zuk collector for the Sao Paulo capital catalog.

Zuk currently blocks the fixed VPS address with Cloudflare.  The collector
therefore uses a configurable reader endpoint that renders the public page as
Markdown.  It remains deterministic: no LLM is involved in extraction.
"""

import asyncio
import os
import re
from datetime import datetime
from typing import Optional

from .base import BaseSource, ScrapedProperty
from .caixa import _parse_area, _parse_brl
from .marketplace import detect_seller, property_type_from_text


SOURCE_ID = "zuk"
BASE_URL = "https://www.portalzuk.com.br"
CATALOG_URL = f"{BASE_URL}/leilao-de-imoveis/c/todos-imoveis/sp/capital/sao-paulo"

_CARD_PATTERN = re.compile(
    r'\[!\[Image\s+\d+:\s*(?P<alt>.*?)\]\((?P<image>https?://[^)]+)\)\]'
    r'\((?P<url>https?://www\.portalzuk\.com\.br/imovel/[^\s]+)\s+"(?P<tooltip>.*?)"\)'
    r'(?P<body>.*?)(?=\n\[!\[Image\s+\d+:|\Z)',
    re.DOTALL,
)


def _normalize_modality(label: str) -> str:
    normalized = label.casefold()
    if "2º" in normalized:
        return "segunda_praca"
    if "1º" in normalized:
        return "primeira_praca"
    return "leilao_online"


class ZukSource(BaseSource):
    source_id = SOURCE_ID
    collector_version = "zuk-1.0.0"
    supports_regions = True
    supports_details = True
    supports_documents = False
    supports_photos = True

    def __init__(self, max_pages: Optional[int] = None):
        self.max_pages = max_pages or int(os.getenv("ZUK_MAX_PAGES", "6"))
        self.reader_base = os.getenv("ZUK_READER_BASE_URL", "https://r.jina.ai").rstrip("/")
        self.page_delay = float(os.getenv("ZUK_PAGE_DELAY", "1.0"))
        self.successful_regions: list[str] = []
        self.failed_regions: list[str] = []

    @staticmethod
    def _parse_markdown(markdown: str) -> list[ScrapedProperty]:
        properties: list[ScrapedProperty] = []
        for match in _CARD_PATTERN.finditer(markdown):
            tooltip = match.group("tooltip").strip()
            body = match.group("body")
            url = match.group("url")
            external_id = url.rstrip("/").rsplit("/", 1)[-1]
            if not external_id or "São Paulo/SP" not in tooltip:
                continue

            price_rows = re.findall(
                r"(1º\s+leilão|2º\s+leilão|Lance\s+inicial|Valor)\s+R\$\s+([\d.]+,\d{2}).*?(\d{2}/\d{2}/\d{4})",
                body,
                re.IGNORECASE | re.DOTALL,
            )
            if not price_rows:
                continue
            selected = next((row for row in price_rows if row[0].casefold().startswith("2º")), price_rows[-1])
            auction_price = _parse_brl(selected[1])
            if not auction_price:
                continue

            type_match = re.search(r"^\*\s+([^\[\n][^\n]*)", body, re.MULTILINE)
            property_type = property_type_from_text(type_match.group(1) if type_match else tooltip)
            location_match = re.search(r"São Paulo / SP\]\([^)]+\)\s*-\s*([^\n]+)", body)
            location_text = location_match.group(1).strip() if location_match else ""

            before_city = tooltip.split(" - São Paulo/SP", 1)[0]
            address = before_city.rsplit(" - ", 1)[-1].strip()
            neighborhood = location_text
            if address and location_text.casefold().endswith(address.casefold()):
                neighborhood = location_text[: -len(address)].strip(" -,")

            area_match = re.search(r"([\d.]+(?:,[\d]+)?)\s*m²", body, re.IGNORECASE)
            area = _parse_area(area_match.group(1)) if area_match else None
            try:
                auction_date = datetime.strptime(selected[2], "%d/%m/%Y").date()
            except ValueError:
                auction_date = None
            seller_id = detect_seller(tooltip, body)
            occupied = None
            if re.search(r"\bDesocupado\b", f"{tooltip} {body}", re.IGNORECASE):
                occupied = False
            elif re.search(r"\bOcupado\b", f"{tooltip} {body}", re.IGNORECASE):
                occupied = True

            properties.append(ScrapedProperty(
                source_id=SOURCE_ID,
                external_id=external_id,
                title=tooltip.split(" | ", 1)[0].strip(),
                auction_price=auction_price,
                seller_id=seller_id,
                address=address or None,
                neighborhood=neighborhood or None,
                city="São Paulo",
                state="SP",
                property_type=property_type,
                area_m2=area,
                description=tooltip,
                edital_url=url,
                photos=[match.group("image")],
                auction_date=auction_date,
                auction_modality=_normalize_modality(selected[0]),
                is_occupied=occupied,
                useful_area_m2=area,
                raw_data={
                    "source_url": url,
                    "seller_evidence": seller_id,
                    "price_label": selected[0],
                    "catalog_excerpt": re.sub(r"\s+", " ", body).strip()[:1200],
                },
            ))
        return properties

    def _reader_url(self, page: int) -> str:
        source_url = CATALOG_URL if page == 1 else f"{CATALOG_URL}?pagina={page}"
        return f"{self.reader_base}/http://{source_url}"

    async def scrape(self) -> list[ScrapedProperty]:
        properties: list[ScrapedProperty] = []
        seen_ids: set[str] = set()
        async with self._build_client() as client:
            for page in range(1, self.max_pages + 1):
                if page > 1:
                    await asyncio.sleep(self.page_delay)
                try:
                    # The reader rejects browser impersonation headers. Identify the
                    # collector explicitly and request the deterministic text output.
                    response = await self._get(
                        client,
                        self._reader_url(page),
                        headers={"User-Agent": "LeilaBot/1.0", "Accept": "text/plain"},
                    )
                    page_properties = self._parse_markdown(response.text)
                    new_count = 0
                    for prop in page_properties:
                        if prop.external_id not in seen_ids:
                            seen_ids.add(prop.external_id)
                            properties.append(prop)
                            new_count += 1
                    if page > 1 and new_count == 0:
                        break
                except Exception as error:
                    self.failed_regions.append(f"page:{page}")
                    print(f"[Zuk] Página {page} falhou: {error}")

        if properties and not self.failed_regions:
            self.successful_regions = ["SP"]
        elif not properties:
            self.failed_regions.append("SP")
        print(f"[Zuk] Total São Paulo/SP: {len(properties)} imóveis")
        return properties
