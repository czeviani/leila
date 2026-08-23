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

from .base import BaseSource, ScrapedProperty, apply_known_stages
from .caixa import _parse_area, _parse_brl
from .marketplace import detect_seller, property_type_from_text


SOURCE_ID = "zuk"
BASE_URL = "https://www.portalzuk.com.br"
CATALOG_URL = f"{BASE_URL}/leilao-de-imoveis/c/todos-imoveis/sp/capital/sao-paulo"

# Sem chave, r.jina.ai limita a ~20 req/min; com uma chave gratuita (jina.ai)
# o teto sobe para 500 req/min. Zuk depende do reader para toda a coleta
# (não é fallback aqui), então vale configurar.
_JINA_API_KEY = os.getenv("JINA_API_KEY", "").strip()


def _reader_headers(**extra: str) -> dict[str, str]:
    headers = dict(extra)
    if _JINA_API_KEY:
        headers["Authorization"] = f"Bearer {_JINA_API_KEY}"
    return headers

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


def _parse_detail_areas(text: str) -> tuple[Optional[float], Optional[float]]:
    built_match = re.search(r"Metragem\s+constru[ií]da\s+([\d.]+(?:,[\d]+)?)\s*m²", text or "", re.I)
    private_match = re.search(r"Metragem\s+privativa\s+([\d.]+(?:,[\d]+)?)\s*m²", text or "", re.I)
    built = _parse_area(built_match.group(1)) if built_match else None
    private = _parse_area(private_match.group(1)) if private_match else None
    return built, private


class ZukSource(BaseSource):
    source_id = SOURCE_ID
    collector_version = "zuk-1.1.0"
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

            prop = ScrapedProperty(
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
            )
            stages = []
            for sequence, row in enumerate(price_rows, start=1):
                label = row[0].strip()
                stage_key = "first" if label.casefold().startswith("1º") else "second" if label.casefold().startswith("2º") else "single"
                try:
                    event_at = datetime.strptime(row[2], "%d/%m/%Y").date().isoformat()
                except ValueError:
                    event_at = None
                stages.append({
                    "stage": stage_key,
                    "label": "1º leilão" if stage_key == "first" else "2º leilão" if stage_key == "second" else label,
                    "sequence": sequence,
                    "price": _parse_brl(row[1]),
                    "event_at": event_at,
                })
            first_stage_price = next(
                (stage["price"] for stage in stages if stage["stage"] == "first" and stage.get("price")),
                None,
            )
            if first_stage_price:
                # 1º leilão/praça equivale ao valor de avaliação, seja no rito
                # judicial (CPC art. 891) ou na alienação fiduciária (Lei
                # 9.514/97 art. 27) — ambos regem os leilões do Zuk.
                prop.appraised_value = first_stage_price
            apply_known_stages(prop, stages)
            properties.append(prop)
        return properties

    def _reader_url(self, page: int) -> str:
        source_url = CATALOG_URL if page == 1 else f"{CATALOG_URL}?pagina={page}"
        return f"{self.reader_base}/http://{source_url}"

    async def _enrich_missing_areas(self, client, properties: list[ScrapedProperty]) -> None:
        candidates = [prop for prop in properties if not prop.area_m2 and prop.edital_url]
        semaphore = asyncio.Semaphore(int(os.getenv("ZUK_DETAIL_CONCURRENCY", "3")))

        async def enrich(prop: ScrapedProperty) -> bool:
            async with semaphore:
                try:
                    response = await self._get(
                        client,
                        f"{self.reader_base}/http://{prop.edital_url}",
                        headers=_reader_headers(**{"User-Agent": "LeilaBot/1.0", "Accept": "text/plain"}),
                    )
                    built, private = _parse_detail_areas(response.text)
                    prop.area_m2 = built or private
                    prop.useful_area_m2 = private or built
                    prop.raw_data["detail_area_built_m2"] = built
                    prop.raw_data["detail_area_private_m2"] = private
                    return bool(prop.area_m2)
                except Exception as error:
                    print(f"[Zuk] Área detalhada {prop.external_id} não enriquecida: {error}")
                    return False

        if candidates:
            enriched = sum(await asyncio.gather(*(enrich(prop) for prop in candidates)))
            print(f"[Zuk] Áreas detalhadas enriquecidas: {enriched}/{len(candidates)}")

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
                        headers=_reader_headers(**{"User-Agent": "LeilaBot/1.0", "Accept": "text/plain"}),
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

            await self._enrich_missing_areas(client, properties)

        if properties and not self.failed_regions:
            self.successful_regions = ["SP"]
        elif not properties:
            self.failed_regions.append("SP")
        print(f"[Zuk] Total São Paulo/SP: {len(properties)} imóveis")
        return properties
