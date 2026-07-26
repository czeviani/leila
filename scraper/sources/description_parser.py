"""
Parser heurístico de descrições de imóveis.

Extrai campos estruturados do campo `description` (texto livre do CSV da Caixa)
usando regex e keywords. Custo zero — sem chamadas de API.

Cobertura estimada: ~80% das descrições da Caixa.
"""

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParsedDescription:
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    parking_spots: Optional[int] = None
    is_occupied: Optional[bool] = None
    property_condition: Optional[str] = None  # precario | habitavel | reformado | novo
    useful_area_m2: Optional[float] = None
    features: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Padrões de quartos/dormitórios
# ---------------------------------------------------------------------------
_BEDROOM_PATTERNS = [
    r"(\d+)\s*(?:quartos?|dorms?|dormitórios?|suítes?\s+e\s+\d+\s*quartos?)",
    r"(\d+)\s*(?:suítes?)",  # fallback: suíte conta como quarto
    r"(\d+)\s*qto\(?s?\)?",  # formato Caixa: "2 qto(s)"
]

# ---------------------------------------------------------------------------
# Padrões de banheiros
# ---------------------------------------------------------------------------
_BATHROOM_PATTERNS = [
    r"(\d+)\s*(?:banheiros?|wcs?|lavabos?|sanitários?|toaletes?)",
]

# Se o texto contém "WC" sem número prefixo, assumir 1 banheiro
_WC_STANDALONE = re.compile(r"(?:^|,\s*|\s)wc(?:\s*,|\s*$)", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Padrões de vagas
# ---------------------------------------------------------------------------
_PARKING_PATTERNS = [
    r"(\d+)\s*vagas?\(?s?\)?\s*(?:de\s*)?(?:garagem|estacionamento)?",
    r"(\d+)\s*(?:garagens?)",
    r"(?:garagem|vaga)\s*(?:para\s*)?(\d+)\s*(?:carros?|veículos?)",
]

# ---------------------------------------------------------------------------
# Padrões de área útil/privativa
# ---------------------------------------------------------------------------
_USEFUL_AREA_PATTERNS = [
    r"(\d+[.,]\d+)\s*m[²2]?\s*(?:útil|privativa?|construída?)",
    r"(?:área\s*útil|área\s*privativa?|área\s*construída?)\s*(?:de\s*)?(\d+[.,]\d+)\s*m[²2]?",
    r"(\d+[.,]\d+)\s*m[²2]?\s*de\s*área\s*(?:útil|privativa?)",
    # Formato Caixa: "47.20 de área privativa" (sem m²)
    r"(\d+[.,]\d+)\s*de\s*área\s*(?:útil|privativa?|total|construída?)",
    r"(?:área\s*útil|área\s*privativa?|área\s*total|área\s*construída?)[,\s]+(\d+[.,]\d+)",
]

# ---------------------------------------------------------------------------
# Ocupação
# ---------------------------------------------------------------------------
_OCCUPIED_KEYWORDS = [
    "imóvel ocupado", "bem ocupado", "encontra-se ocupado",
    "está ocupado", "ocupado por", "ocupação irregular",
]
_VACANT_KEYWORDS = [
    "desocupado", "vago", "livre", "imóvel vago", "sem ocupação",
    "encontra-se vago", "está vago", "desocupada",
]

# ---------------------------------------------------------------------------
# Condição do imóvel
# ---------------------------------------------------------------------------
_PRECARIO_KEYWORDS = [
    "precário", "péssimo estado", "ruins condições", "mau estado",
    "deteriorado", "abandono", "abandonado", "depreciado",
    "necessita reforma urgente", "necessita grandes reformas",
    "necessita de reforma urgente",
]
_HABITAVEL_KEYWORDS = [
    "habitável", "estado regular", "condições regulares",
    "necessita reforma", "necessita reparos", "pequenos reparos",
    "conservação regular",
]
_REFORMADO_KEYWORDS = [
    "reformado", "bom estado", "ótimo estado", "excelente estado",
    "bem conservado", "boa conservação", "ótima conservação",
    "conservação boa", "bem cuidado", "estado de conservação bom",
    "estado de conservação ótimo",
]
_NOVO_KEYWORDS = [
    "novo", "nunca habitado", "nunca ocupado", "obra nova",
    "imóvel novo", "construção nova", "recém construído",
    "lançamento", "em construção",
]

# ---------------------------------------------------------------------------
# Features / amenidades
# ---------------------------------------------------------------------------
_FEATURE_KEYWORDS: dict[str, list[str]] = {
    "piscina": ["piscina"],
    "churrasqueira": ["churrasqueira", "churrasco"],
    "elevador": ["elevador"],
    "varanda": ["varanda", "sacada", "terraço"],
    "jardim": ["jardim", "área verde", "quintal"],
    "academia": ["academia", "fitness"],
    "playground": ["playground", "parquinho"],
    "salao_festas": ["salão de festas", "salao de festas"],
    "portaria": ["portaria 24h", "portaria 24", "porteiro"],
    "ar_condicionado": ["ar condicionado", "ar-condicionado"],
    "suite": ["suíte", "suite"],
    "closet": ["closet", "armário embutido", "armários embutidos"],
    "despensa": ["despensa"],
    "lavanderia": ["lavanderia", "área de serviço"],
    "gás_encanado": ["gás encanado", "gas encanado"],
    "condominio_fechado": ["condomínio fechado", "condominio fechado"],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    """Lowercase sem acentos para matching robusto."""
    return text.lower().strip()


def _match_int(patterns: list[str], text: str) -> Optional[int]:
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return int(m.group(1))
            except (IndexError, ValueError):
                pass
    return None


def _match_float(patterns: list[str], text: str) -> Optional[float]:
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(",", "."))
            except (IndexError, ValueError):
                pass
    return None


def _match_keywords(keywords: list[str], text: str) -> bool:
    low = _clean(text)
    return any(kw.lower() in low for kw in keywords)


# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------

def parse_description(description: Optional[str]) -> ParsedDescription:
    """
    Extrai dados estruturados de uma descrição de imóvel.

    Retorna ParsedDescription com campos preenchidos onde possível.
    Campos não detectados ficam como None/empty dict.
    """
    if not description:
        return ParsedDescription()

    text = description.strip()

    # Quartos
    bedrooms = _match_int(_BEDROOM_PATTERNS, text)

    # Banheiros — tenta número explícito, senão detecta "WC" standalone → 1
    bathrooms = _match_int(_BATHROOM_PATTERNS, text)
    if bathrooms is None and _WC_STANDALONE.search(text):
        bathrooms = 1

    # Vagas
    parking_spots = _match_int(_PARKING_PATTERNS, text)

    # Área útil
    useful_area_m2 = _match_float(_USEFUL_AREA_PATTERNS, text)

    # Ocupação — verifica desocupado antes de ocupado (evita falso positivo)
    is_occupied: Optional[bool] = None
    if _match_keywords(_VACANT_KEYWORDS, text):
        is_occupied = False
    elif _match_keywords(_OCCUPIED_KEYWORDS, text):
        is_occupied = True

    # Condição — do mais severo ao mais positivo
    property_condition: Optional[str] = None
    if _match_keywords(_PRECARIO_KEYWORDS, text):
        property_condition = "precario"
    elif _match_keywords(_NOVO_KEYWORDS, text):
        property_condition = "novo"
    elif _match_keywords(_REFORMADO_KEYWORDS, text):
        property_condition = "reformado"
    elif _match_keywords(_HABITAVEL_KEYWORDS, text):
        property_condition = "habitavel"

    # Features
    features: dict[str, bool] = {}
    low = _clean(text)
    for feature_key, kws in _FEATURE_KEYWORDS.items():
        if any(kw.lower() in low for kw in kws):
            features[feature_key] = True

    return ParsedDescription(
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        parking_spots=parking_spots,
        is_occupied=is_occupied,
        property_condition=property_condition,
        useful_area_m2=useful_area_m2,
        features=features,
    )
