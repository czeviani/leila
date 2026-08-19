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
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

from .base import BaseSource, ScrapedProperty
from .area_classifier import classify_area
from .description_parser import parse_description
from proxy.manager import get_proxy

SOURCE_ID = "caixa"
BASE_URL = "https://venda-imoveis.caixa.gov.br"
CSV_URL = f"{BASE_URL}/listaweb/Lista_imoveis_{{uf}}.csv"

# Todos as UFs disponíveis
ALL_UFS = [
    "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA",
    "MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
    "RO","RR","RS","SC","SE","SP","TO"
]

# O produto está deliberadamente restrito à capital paulista. Mesmo que uma
# configuração antiga ainda liste outras UFs, o coletor não sai desse limite.
_env_ufs = os.getenv("SCRAPER_UFS", "").strip()
_configured_ufs = [u.strip().upper() for u in _env_ufs.split(",") if u.strip()]
DEFAULT_UFS = [uf for uf in (_configured_ufs or ["SP"]) if uf == "SP"] or ["SP"]

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
    # Compra Direta — preço fixo, paga e o imóvel é seu sem concorrência
    "venda direta":               "compra_direta",
    "venda online":               "compra_direta",
    "venda direta online":        "compra_direta",
    # 2ª Praça+ — leilão judicial 2º round ou mais, lance mínimo ~60% do avaliado
    "2ª praça":                   "segunda_praca",
    "2a praca":                   "segunda_praca",
    "3ª praça":                   "segunda_praca",   # agrupado com 2ª+ para simplificar
    "3a praca":                   "segunda_praca",
    # 1ª Praça — primeiro round judicial, lance mínimo = valor de avaliação
    "1ª praça":                   "primeira_praca",
    "1a praca":                   "primeira_praca",
    "licitação":                  "primeira_praca",  # licitação genérica da Caixa
    "leilão judicial":            "primeira_praca",
    "leilão extrajudicial":       "primeira_praca",
    "leilão":                     "primeira_praca",
    # Leilão Online — lances em tempo real pela internet
    "licitação aberta":           "leilao_online",
    "licitação aberta online":    "leilao_online",
    "licitação online":           "leilao_online",
    "leilão online":              "leilao_online",
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


def _parse_detail_stages(html: str) -> list[dict]:
    """Extract the two official SFI stages from a Caixa detail page."""
    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    stages: list[dict] = []
    for number, stage_name in ((1, "first"), (2, "second")):
        price_match = re.search(
            rf"Valor\s+m[ií]nimo\s+de\s+venda\s+{number}[ºo°]\s*Leil[aã]o\s*:\s*R\$\s*([\d.]+,\d{{2}})",
            text,
            re.IGNORECASE,
        )
        date_match = re.search(
            rf"Data\s+do\s+{number}[ºo°]\s*Leil[aã]o\s*-\s*(\d{{2}}/\d{{2}}/\d{{4}})\s*-\s*(\d{{1,2}})h(\d{{2}})",
            text,
            re.IGNORECASE,
        )
        if not price_match and not date_match:
            continue
        event_at = None
        if date_match:
            parsed = datetime.strptime(
                f"{date_match.group(1)} {date_match.group(2)}:{date_match.group(3)}",
                "%d/%m/%Y %H:%M",
            ).replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
            event_at = parsed.isoformat()
        stages.append({
            "stage": stage_name,
            "price": _parse_brl(price_match.group(1)) if price_match else None,
            "event_at": event_at,
        })
    return stages


def _apply_detail_stages(prop: ScrapedProperty, stages: list[dict], now: Optional[datetime] = None) -> bool:
    if not stages:
        return False
    now = now or datetime.now(ZoneInfo("America/Sao_Paulo"))
    by_stage = {item["stage"]: item for item in stages}
    first = by_stage.get("first")
    second = by_stage.get("second")
    first_at = datetime.fromisoformat(first["event_at"]) if first and first.get("event_at") else None
    current = first if first and (not first_at or now <= first_at) else (second or first)
    if not current:
        return False

    confirmed_prices = [item for item in stages if item.get("price")]
    target = min(confirmed_prices, key=lambda item: item["price"], default=current)
    enriched_stages = []
    for sequence, item in enumerate(stages, start=1):
        item_at = datetime.fromisoformat(item["event_at"]) if item.get("event_at") else None
        status = "current" if item["stage"] == current["stage"] else ("completed" if item_at and item_at < now else "upcoming")
        enriched_stages.append({
            **item,
            "label": "1º leilão" if item["stage"] == "first" else "2º leilão",
            "sequence": sequence,
            "status": status,
            "certainty": "official",
        })
    prop.auction_stage = current["stage"]
    prop.auction_stages = enriched_stages
    prop.auction_modality = "primeira_praca" if current["stage"] == "first" else "segunda_praca"
    prop.current_stage_price = current.get("price")
    prop.current_stage_date = datetime.fromisoformat(current["event_at"]).date() if current.get("event_at") else None
    prop.target_stage = target.get("stage")
    prop.journey_confidence = "official"
    if target.get("price"):
        # Na mesa, lance = menor mínimo oficial já conhecido para a estratégia.
        prop.auction_price = target["price"]
        if prop.appraised_value:
            prop.discount_pct = round((1 - prop.auction_price / prop.appraised_value) * 100, 2)
    if current.get("event_at"):
        prop.auction_date = datetime.fromisoformat(current["event_at"]).date()
    prop.raw_data["auction_stages"] = enriched_stages
    prop.raw_data["auction_stage"] = prop.auction_stage
    prop.raw_data["target_stage"] = prop.target_stage
    return True


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


def _normalize_neighborhood(raw: str) -> Optional[str]:
    """Limpa o rótulo do bairro sem inventar informação ausente na fonte."""
    value = re.sub(r"\s+", " ", (raw or "").strip(" ,-"))
    return value.title() if value else None


class CaixaSource(BaseSource):
    source_id = SOURCE_ID
    collector_version = "caixa-1.2.0"
    supports_regions = True
    supports_details = True
    supports_documents = False
    supports_photos = False
    supports_reconciliation = True

    def __init__(self, ufs: Optional[list[str]] = None):
        self.ufs = ufs or DEFAULT_UFS
        self.successful_regions: list[str] = []
        self.failed_regions: list[str] = []

    async def _scrape_uf(self, session: AsyncSession, uf: str) -> list[ScrapedProperty]:
        url = CSV_URL.format(uf=uf)
        properties = []

        try:
            await asyncio.sleep(random.uniform(1.0, 3.0))
            # Escolhe um proxy por UF/tentativa. Um único IP bloqueado não deve
            # condenar a rodada inteira.
            response = await session.get(url, timeout=30, proxy=get_proxy())
            response.raise_for_status()
        except Exception as e:
            print(f"[Caixa] Erro ao baixar CSV para {uf}: {e}")
            self.failed_regions.append(uf)
            return []

        content = response.content.decode("latin-1", errors="replace")

        # Detectar CAPTCHA/WAF em vez de CSV
        if content.strip().startswith("<") or "CAPTCHA" in content or "Bot Manager" in content:
            print(f"[Caixa] {uf}: bloqueado por WAF (recebeu HTML)")
            self.failed_regions.append(uf)
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
            self.failed_regions.append(uf)
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
        if properties:
            self.successful_regions.append(uf)
        else:
            # Um CSV parseado com zero linhas é anômalo para a fonte e não pode
            # servir de evidência para remover todos os anúncios daquela UF.
            self.failed_regions.append(uf)
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

        neighborhood = _normalize_neighborhood(normalized.get("bairro") or "")
        address_parts = [
            normalized.get("endereço") or normalized.get("endereco") or "",
            neighborhood or "",
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
        is_sfi_auction = "leilão sfi" in raw_modality.casefold()
        # O CSV traz apenas um preço e não informa qual etapa está vigente.
        # Para SFI, a etapa só é definida após ler a página oficial do imóvel.
        auction_modality = None if is_sfi_auction else _normalize_modality(raw_modality)

        raw_area = normalized.get("área total") or normalized.get("area total") or ""
        area_m2 = _parse_area(raw_area)

        area_classification = classify_area(
            address=address or None,
            city=city or None,
            state=uf,
            appraised_value=appraised_value,
            area_m2=area_m2,
        )

        description = normalized.get("descrição") or normalized.get("descricao") or None

        # Camada 1: extração heurística zero-custo a partir da descrição
        parsed = parse_description(description)

        # Área útil: preferir campo explícito do CSV se existir, senão usar o parser
        useful_area_raw = (
            normalized.get("área privativa") or
            normalized.get("area privativa") or
            normalized.get("área útil") or
            normalized.get("area util") or
            ""
        )
        useful_area_m2 = _parse_area(useful_area_raw) or parsed.useful_area_m2

        # Se área total do CSV é zero/None, usar área privativa como área_m2
        if not area_m2 or area_m2 == 0.0:
            area_m2 = useful_area_m2

        return ScrapedProperty(
            source_id=SOURCE_ID,
            external_id=f"{uf}-{external_id}",
            title=title,
            address=address or None,
            neighborhood=neighborhood,
            city=city or None,
            state=uf,
            zip_code=normalized.get("cep") or None,
            property_type=_normalize_type(raw_type) if raw_type else None,
            area_m2=area_m2,
            appraised_value=appraised_value,
            auction_price=auction_price,
            discount_pct=discount_pct,
            description=description,
            edital_url=edital_url,
            auction_modality=auction_modality,
            auction_stage="unknown" if is_sfi_auction else None,
            area_classification=area_classification,
            raw_data=dict(normalized),
            # Campos de enriquecimento heurístico
            bedrooms=parsed.bedrooms,
            bathrooms=parsed.bathrooms,
            parking_spots=parsed.parking_spots,
            is_occupied=parsed.is_occupied,
            property_condition=parsed.property_condition,
            useful_area_m2=useful_area_m2,
            features=parsed.features,
        )

    async def _enrich_sfi_details(self, session: AsyncSession, properties: list[ScrapedProperty]) -> None:
        candidates = [
            prop for prop in properties
            if "leilão sfi" in str(prop.raw_data.get("modalidade de venda") or "").casefold()
            and (prop.city or "").casefold() in {"são paulo", "sao paulo"}
            and prop.edital_url
        ][: int(os.getenv("CAIXA_DETAIL_MAX", "350"))]
        semaphore = asyncio.Semaphore(int(os.getenv("CAIXA_DETAIL_CONCURRENCY", "3")))

        async def enrich(prop: ScrapedProperty) -> bool:
            async with semaphore:
                try:
                    await asyncio.sleep(random.uniform(0.15, 0.45))
                    response = await session.get(prop.edital_url, timeout=25, proxy=get_proxy())
                    response.raise_for_status()
                    return _apply_detail_stages(prop, _parse_detail_stages(response.text))
                except Exception as error:
                    print(f"[Caixa] Detalhe {prop.external_id} não enriquecido: {error}")
                    return False

        if candidates:
            enriched = sum(await asyncio.gather(*(enrich(prop) for prop in candidates)))
            print(f"[Caixa] Etapas SFI enriquecidas: {enriched}/{len(candidates)}")

    async def scrape(self) -> list[ScrapedProperty]:
        # curl-cffi com fingerprint Chrome120 para bypassar Radware WAF
        async with AsyncSession(impersonate="chrome120") as session:
            # Visita a página principal primeiro para obter cookies de sessão
            try:
                await session.get(
                    "https://venda-imoveis.caixa.gov.br/sistema/login-site.asp",
                    timeout=15,
                    proxy=get_proxy(),
                )
                await asyncio.sleep(2)
            except Exception:
                pass

            # Raspa UFs sequencialmente (evita rate-limit)
            properties: list[ScrapedProperty] = []
            for uf in self.ufs:
                batch = await self._scrape_uf(session, uf)
                properties.extend(batch)

            await self._enrich_sfi_details(session, properties)

        print(f"[Caixa] Total: {len(properties)} imóveis em {len(self.ufs)} UFs")
        return properties
