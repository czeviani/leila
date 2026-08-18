"""Shared deterministic normalization for marketplace collectors."""

import re
from datetime import datetime
from typing import Optional


SELLER_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("santander", ("banco santander", "santander brasil", "santander")),
    ("itau", ("itau unibanco", "banco itau", "itaú unibanco", "banco itaú", "itaú", "itau")),
    ("bradesco", ("banco bradesco", "bradesco")),
    ("bb", ("banco do brasil s/a", "banco do brasil s.a", "banco do brasil")),
    ("caixa", ("caixa economica federal", "caixa econômica federal")),
)


def detect_seller(*values: object) -> Optional[str]:
    text = " ".join(str(value or "") for value in values).casefold()
    for seller_id, patterns in SELLER_PATTERNS:
        if any(pattern.casefold() in text for pattern in patterns):
            return seller_id
    return None


def property_type_from_text(value: str | None) -> Optional[str]:
    text = (value or "").casefold()
    for needle, label in (
        ("apartamento", "apartamento"),
        ("apto", "apartamento"),
        ("casa", "casa"),
        ("sobrado", "sobrado"),
        ("terreno", "terreno"),
        ("lote", "terreno"),
        ("galpão", "galpão"),
        ("galpao", "galpão"),
        ("prédio", "prédio"),
        ("predio", "prédio"),
        ("sala", "sala"),
        ("loja", "loja"),
        ("vaga", "vaga"),
        ("garagem", "vaga"),
        ("agência", "agência"),
        ("agencia", "agência"),
    ):
        if needle in text:
            return label
    return None


def parse_brazilian_date(value: str | None) -> Optional[datetime]:
    match = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", value or "")
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%d/%m/%Y")
    except ValueError:
        return None


def is_non_property_offer(value: str | None) -> bool:
    text = (value or "").casefold()
    return any(term in text for term in (
        "cota de consórcio",
        "cota de consorcio",
        "carta de crédito",
        "carta de credito",
        "crédito para aquisição de imóvel",
        "credito para aquisicao de imovel",
    ))
