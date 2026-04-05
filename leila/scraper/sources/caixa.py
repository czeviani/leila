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
import time
import random
from datetime import datetime
from typing import Optional

from curl_cffi.requests import AsyncSession

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

# Mapeia modalidade de venda da Caixa para categorias padronizadas
MODALITY_MAP: dict[str, str] = {
    # Compra Direta — paga e o imóvel é seu, sem lances
    "venda direta":               "compra_direta",
    "venda online":               "compra_direta",
    "venda direta online":        "compra_direta",
    # Leilão Online — lances online em tempo real
    "licitação aberta":           "leilao_online",
    "licitação aberta online":    "leilao_online",
    "licitação online":           "leilao_online",
    "leilão online":              "leilao_online",
    # Leilão — com leiloeiro oficial (presencial ou híbrido)
    "licitação":                  "leilao",
    "1ª praça":                   "leilao",
    "2ª praça":                   "leilao",
    "leilão":                     "leilao",
    "leilão judicial":            "leilao",
    "leilão extrajudicial":       "leilao",
    # Proposta Fechada — banco escolhe a melhor proposta enviada
    "proposta online":            "proposta_fechada",
    "concorrência":               "proposta_fechada",
    "proposta fechada":           "proposta_fechada",
}


def _normalize_modality(raw: str) -> Optional[str]:
    """Converte modalidade raw do CSV para categoria padronizada."""
    if not raw:
        return None
    key = raw.strip().lower()
    # Busca exata
    if key in MODALITY_MAP:
        return MODALITY_MAP[key]
    # Busca parcial
    for pattern, category in MODALITY_MAP.items():
        if pattern in key:
            return category
    return None


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

    async def _scrape_uf(self, session: AsyncSession, uf: str) -> list[ScrapedProperty]:
        url = CSV_URL.format(uf=uf)
        properties = []

        try:
            await asyncio.sleep(random.uniform(1.0, 3.0))
            response = await session.get(url, timeout=30)
            response.raise_for_status()
        except Exception as e:
            print(f"[Caixa] Erro ao baixar CSV para {uf}: {e}")
            return []

        content = response.content.decode("latin-1", errors="replace")

        # Detectar CAPTCHA/WAF em vez de CSV
        if content.strip().startswith("<") or "CAPTCHA" in content or "Bot Manager" in content:
            print(f"[Caixa] {uf}: bloqueado por WAF (recebeu HTML)")
            return []

        # O CSV da Caixa tem linhas de metadata antes do cabeçalho real.
        # Pula até encontrar a linha que começa com o campo de ID do imóvel.
        lines = content.splitlines()
        header_idx = None
        for i, line in enumerate(lines):
            low = line.lower()
            if "n°" in low or "numero" in low or "imóvel" in low or "imovel" in low:
                if ";" in line:  # é linha CSV, não texto livre
                    header_idx = i
                    break

        if header_idx is None:
            print(f"[Caixa] {uf}: header CSV não encontrado")
            return []

        csv_content = "\n".join(lines[header_idx:])
        reader = csv.DictReader(io.StringIO(csv_content), delimiter=";")
        for row in reader:
            try:
                prop = self._parse_row(row, uf)
                if prop:
                    properties.append(prop)
            except Exception as e:
                print(f"[Caixa] Erro ao parsear linha ({uf}): {e}")

        print(f"[Caixa] {uf}: {len(properties)} imóveis")
        return properties

    def _parse_row(self, row: dict, uf: str) -> Optional[ScrapedProperty]:
        # Normaliza chaves (Caixa usa headers com espaços e acentos)
        normalized = {k.strip().lower(): v.strip() for k, v in row.items() if k}

        # Campo do ID externo
        external_id = (
            normalized.get("n° do imóvel") or   # formato real do CSV
            normalized.get("nº do imóvel") or
            normalized.get("numero do imovel") or
            normalized.get("numero_imovel") or
            normalized.get("codigo") or
            ""
        ).strip()

        if not external_id:
            return None

        auction_price_raw = (
            normalized.get("preço") or           # formato real do CSV
            normalized.get("preco") or
            normalized.get("valor de venda") or
            normalized.get("valor venda") or
            ""
        )
        auction_price = _parse_brl(auction_price_raw)
        if not auction_price:
            return None

        appraised_raw = (
            normalized.get("valor de avaliação") or
            normalized.get("valor avaliacao") or
            normalized.get("avaliação") or
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

        # Se não achou tipo ainda, tentar inferir do título/descrição
        if not raw_type:
            desc = normalized.get("descrição") or normalized.get("descricao") or ""
            for abbr in PROPERTY_TYPE_MAP:
                if abbr.lower() in desc.lower():
                    raw_type = abbr
                    break

        title = f"{_normalize_type(raw_type).title()} — {city}/{uf}".strip()
        if not title.startswith("—"):
            title = title

        edital_url_fragment = normalized.get("link de acesso") or normalized.get("link") or ""
        edital_url = edital_url_fragment if edital_url_fragment.startswith("http") else None

        raw_modality = (
            normalized.get("modalidade de venda") or
            normalized.get("modalidade") or
            normalized.get("tipo de venda") or
            ""
        )
        auction_modality = _normalize_modality(raw_modality)

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
            auction_modality=auction_modality,
            raw_data=dict(normalized),
        )

    async def scrape(self) -> list[ScrapedProperty]:
        # curl-cffi com fingerprint Chrome120 para bypassar Radware WAF
        async with AsyncSession(impersonate="chrome120") as session:
            # Visita a página principal primeiro para obter cookies de sessão
            try:
                await session.get(
                    "https://venda-imoveis.caixa.gov.br/sistema/login-site.asp",
                    timeout=15
                )
                await asyncio.sleep(2)
            except Exception:
                pass

            # Raspa UFs sequencialmente (evita rate-limit)
            properties: list[ScrapedProperty] = []
            for uf in self.ufs:
                batch = await self._scrape_uf(session, uf)
                properties.extend(batch)

        print(f"[Caixa] Total: {len(properties)} imóveis em {len(self.ufs)} UFs")
        return properties
