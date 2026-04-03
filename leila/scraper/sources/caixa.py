"""
Scraper da Caixa Econômica Federal.

Fonte: https://venda-imoveis.caixa.gov.br

A Caixa bloqueia IPs internacionais. Em produção, usar proxy BR.
API interna: https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_[UF].csv

Estratégia:
  1. Para cada UF, baixa o CSV de imóveis disponíveis
  2. Parseia os campos e normaliza
  3. Para desconto e edital, pode enriquecer via página de detalhe (opcional)
"""

import os
import re
import io
import csv
import asyncio
from datetime import datetime
from typing import Optional

import httpx

from .base import BaseSource, ScrapedProperty

SOURCE_ID = "caixa"
BASE_URL = "https://venda-imoveis.caixa.gov.br"
CSV_URL = f"{BASE_URL}/listaweb/Lista_imoveis_{{uf}}.csv"

# Todos as UFs disponíveis
ALL_UFS = [
    "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA",
    "MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
    "RO","RR","RS","SC","SE","SP","TO"
]

# UFs padrão: principais mercados de leilão do Brasil
# Pode ser sobrescrito via env: SCRAPER_UFS=SP,RJ,MG
_env_ufs = os.getenv("SCRAPER_UFS", "").strip()
DEFAULT_UFS = [u.strip().upper() for u in _env_ufs.split(",") if u.strip()] if _env_ufs else [
    "SP", "RJ", "MG", "PR", "RS", "SC", "GO", "DF", "BA", "CE", "PE"
]

PROPERTY_TYPE_MAP = {
    "AP": "apartamento",
    "CA": "casa",
    "TE": "terreno",
    "LO": "loja",
    "PR": "prédio",
    "GR": "galpão",
    "SA": "sala",
    "SO": "sobrado",
}


def _parse_brl(value: str) -> Optional[float]:
    """Converte 'R$ 1.234.567,89' ou '1234567.89' para float."""
    if not value:
        return None
    clean = re.sub(r"[R$\s]", "", value).replace(".", "").replace(",", ".")
    try:
        return float(clean)
    except ValueError:
        return None


def _parse_area(value: str) -> Optional[float]:
    if not value:
        return None
    clean = re.sub(r"[^\d,.]", "", value).replace(",", ".")
    try:
        return float(clean)
    except ValueError:
        return None


def _normalize_type(raw: str) -> str:
    for abbr, label in PROPERTY_TYPE_MAP.items():
        if abbr.lower() in raw.lower():
            return label
    return raw.lower().strip()


class CaixaSource(BaseSource):
    source_id = SOURCE_ID

    def __init__(self, ufs: Optional[list[str]] = None):
        self.ufs = ufs or DEFAULT_UFS

    async def _scrape_uf(self, client: httpx.AsyncClient, uf: str) -> list[ScrapedProperty]:
        url = CSV_URL.format(uf=uf)
        properties = []

        try:
            response = await self._get(client, url)
        except Exception as e:
            print(f"[Caixa] Erro ao baixar CSV para {uf}: {e}")
            return []

        # Caixa usa encoding latin-1 nos CSVs
        content = response.content.decode("latin-1", errors="replace")

        # Debug: mostrar primeiros 300 chars para diagnóstico
        preview = content[:300].replace("\n", " ").replace("\r", "")
        print(f"[Caixa] {uf} HTTP {response.status_code} | {len(response.content)} bytes | preview: {preview[:150]}")

        reader = csv.DictReader(io.StringIO(content), delimiter=";")

        for row in reader:
            try:
                prop = self._parse_row(row, uf)
                if prop:
                    properties.append(prop)
            except Exception as e:
                print(f"[Caixa] Erro ao parsear linha ({uf}): {e} — {row}")

        print(f"[Caixa] {uf}: {len(properties)} imóveis")
        return properties

    def _parse_row(self, row: dict, uf: str) -> Optional[ScrapedProperty]:
        # Normaliza chaves (Caixa usa headers com espaços e acentos)
        normalized = {k.strip().lower(): v.strip() for k, v in row.items() if k}

        # Campo do ID externo — pode ser 'nº do imóvel' ou 'numero do imovel'
        external_id = (
            normalized.get("nº do imóvel") or
            normalized.get("numero do imovel") or
            normalized.get("numero_imovel") or
            normalized.get("codigo") or
            ""
        ).strip()

        if not external_id:
            return None

        auction_price_raw = (
            normalized.get("valor de venda") or
            normalized.get("valor venda") or
            normalized.get("preco") or
            ""
        )
        auction_price = _parse_brl(auction_price_raw)
        if not auction_price:
            return None

        appraised_raw = (
            normalized.get("valor de avaliação") or
            normalized.get("valor avaliacao") or
            ""
        )
        appraised_value = _parse_brl(appraised_raw)
        discount_pct: Optional[float] = None
        if appraised_value and appraised_value > 0:
            discount_pct = round((1 - auction_price / appraised_value) * 100, 2)

        raw_type = (
            normalized.get("tipo do imóvel") or
            normalized.get("tipo de imovel") or
            normalized.get("tipo") or
            ""
        )

        city = (
            normalized.get("cidade") or
            normalized.get("municipio") or
            normalized.get("município") or
            ""
        ).strip().title()

        address_parts = [
            normalized.get("endereço") or normalized.get("endereco") or "",
            normalized.get("bairro") or "",
        ]
        address = ", ".join(p for p in address_parts if p).strip()

        title = f"{_normalize_type(raw_type).title()} — {city}/{uf}".strip()
        if not title.startswith("—"):
            title = title

        edital_url_fragment = normalized.get("link de acesso") or normalized.get("link") or ""
        edital_url = edital_url_fragment if edital_url_fragment.startswith("http") else None

        return ScrapedProperty(
            source_id=SOURCE_ID,
            external_id=f"{uf}-{external_id}",
            title=title,
            address=address or None,
            city=city or None,
            state=uf,
            zip_code=normalized.get("cep") or None,
            property_type=_normalize_type(raw_type) if raw_type else None,
            area_m2=_parse_area(normalized.get("área total") or normalized.get("area total") or ""),
            appraised_value=appraised_value,
            auction_price=auction_price,
            discount_pct=discount_pct,
            description=normalized.get("descrição") or normalized.get("descricao") or None,
            edital_url=edital_url,
            raw_data=dict(normalized),
        )

    async def scrape(self) -> list[ScrapedProperty]:
        async with self._build_client() as client:
            tasks = [self._scrape_uf(client, uf) for uf in self.ufs]
            results = await asyncio.gather(*tasks)

        properties: list[ScrapedProperty] = []
        for batch in results:
            properties.extend(batch)

        print(f"[Caixa] Total: {len(properties)} imóveis em {len(self.ufs)} UFs")
        return properties
