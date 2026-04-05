"""
Classificação heurística de área para imóveis de leilão.

Prioridade: keywords no endereço/bairro → preço/m² (valor de avaliação) → indefinido.
A avaliação IA (leila_evaluations.area_classification) sempre sobrescreve este resultado.

Categorias:
  nobre        → alta renda, valorização histórica, infraestrutura premium
  intermediário → classe média, boa infraestrutura, mercado ativo
  popular       → classe baixa/média-baixa, infraestrutura básica
  comunidade    → favela, ocupação irregular, alta vulnerabilidade social
  indefinido    → dados insuficientes para classificar
"""

from typing import Optional

# ── Cidades de alto valor (alçados thresholds de preço) ──────────────────────
# Capitais + metrópoles onde o m² é estruturalmente mais alto
HIGH_VALUE_CITIES = {
    'são paulo', 'rio de janeiro', 'brasília', 'curitiba', 'porto alegre',
    'florianópolis', 'campinas', 'santos', 'niterói', 'são bernardo do campo',
    'guarulhos', 'osasco', 'santo andré', 'são caetano do sul', 'barueri',
    'alphaville', 'tamboré',
}

MID_VALUE_CITIES = {
    'belo horizonte', 'fortaleza', 'recife', 'salvador', 'manaus', 'belém',
    'goiânia', 'natal', 'maceió', 'joão pessoa', 'teresina', 'aracaju',
    'campo grande', 'cuiabá', 'porto velho', 'macapá', 'boa vista', 'palmas',
    'vitória', 'são luís', 'londrina', 'maringá', 'joinville', 'blumenau',
    'caxias do sul', 'pelotas', 'uberlândia', 'ribeirão preto', 'sorocaba',
    'são josé dos campos', 'mogi das cruzes', 'diadema',
}

# ── Keywords de área NOBRE ───────────────────────────────────────────────────
# Bairros/regiões reconhecidamente de alta renda no Brasil
NOBRE_KEYWORDS = [
    # São Paulo capital
    'jardim europa', 'jardim paulista', 'jardim america', 'jardim américas',
    'itaim bibi', 'itaim', 'vila nova conceição', 'morumbi',
    'higienópolis', 'moema', 'campo belo', 'brooklin', 'panamby',
    'vila mariana', 'perdizes', 'pinheiros', 'vila madalena',
    # Grande SP / interior SP
    'alphaville', 'tamboré', 'granja viana', 'granja viana',
    'residencial alphaville', 'village', 'colinas do mosteiro',
    # Rio de Janeiro
    'leblon', 'ipanema', 'copacabana', 'lagoa', 'jardim botânico',
    'gávea', 'urca', 'são conrado', 'joá', 'joatinga',
    'barra da tijuca', 'recreio dos bandeirantes',
    # Belo Horizonte
    'savassi', 'lourdes', 'funcionários', 'cidade jardim', 'belvedere',
    'mangabeiras', 'buritis', 'vale do sereno',
    # Curitiba
    'batel', 'água verde', 'bigorrilho', 'champagnat',
    'seminário', 'mercês', 'hugo lange',
    # Porto Alegre
    'moinhos de vento', 'mont serrat', 'três figos', 'bela vista',
    'petrópolis', 'auxiliadora',
    # Florianópolis
    'jurerê internacional', 'campeche', 'ingleses', 'lagoa da conceição',
    # Recife / Fortaleza
    'boa viagem', 'pina', 'meireles', 'aldeota',
    # Genérico
    'condomínio fechado', 'condomínio clube', 'residencial fechado',
]

# ── Keywords de área COMUNIDADE ──────────────────────────────────────────────
# Sinais diretos de favela / ocupação irregular / alta vulnerabilidade
COMUNIDADE_KEYWORDS = [
    # Termos genéricos (funcionam em qualquer cidade)
    'favela', 'morro do ', 'morro da ', 'comunidade do ', 'comunidade da ',
    'comunidade dos ', 'cohab ', 'conjunto habitacional coh',
    'nucleo habitacional', 'núcleo habitacional',
    # São Paulo
    'paraisópolis', 'heliópolis', 'heliopolis',
    'capão redondo', 'jardim ângela', 'jardim angela',
    'brasilândia', 'cidade tiradentes', 'cidade ademar',
    'jardim são luís', 'jardim são luis',
    'grajaú', 'lajeado', 'guaianazes', 'itaquera',
    'vila canindé', 'vila nova cachoeirinha',
    'jardim keralux', 'jardim helena',
    # Rio de Janeiro
    'rocinha', 'complexo do alemão', 'complexo do alemao',
    'vigário geral', 'vigario geral', 'jacarezinho',
    'manguinhos', 'maré', 'mare', 'cidade de deus',
    'acari', 'anchieta', 'cavalcanti', 'costa barros',
    # Outras capitais
    'estrutural', 'sol nascente', 'ceilândia', 'ceilandia',
    'itapuã', 'itapua', 'pau da lima', 'subúrbio ferroviário',
    'suburbio ferroviario',
]

# ── Thresholds de preço/m² por tier de cidade ────────────────────────────────
# Baseado no valor de AVALIAÇÃO (PTAM), não no lance mínimo
# Tier | Nobre    | Intermediário | Popular   | Comunidade
# High | > 9.000  | 4.500-9.000   | 1.800-4.500 | < 1.800
# Mid  | > 5.500  | 2.500-5.500   | 1.000-2.500 | < 1.000
# Low  | > 3.500  | 1.500-3.500   |   600-1.500 | <   600

THRESHOLDS = {
    'high': (9_000, 4_500, 1_800),   # (nobre_min, intermediario_min, popular_min)
    'mid':  (5_500, 2_500, 1_000),
    'low':  (3_500, 1_500,   600),
}


def _city_tier(city: Optional[str]) -> str:
    if not city:
        return 'low'
    c = city.lower().strip()
    if c in HIGH_VALUE_CITIES:
        return 'high'
    if c in MID_VALUE_CITIES:
        return 'mid'
    return 'low'


def _price_based(ptam_m2: float, tier: str) -> str:
    nobre_min, inter_min, pop_min = THRESHOLDS[tier]
    if ptam_m2 >= nobre_min:
        return 'nobre'
    if ptam_m2 >= inter_min:
        return 'intermediário'
    if ptam_m2 >= pop_min:
        return 'popular'
    return 'comunidade'


def classify_area(
    address: Optional[str],
    city: Optional[str],
    state: Optional[str],
    appraised_value: Optional[float],
    area_m2: Optional[float],
) -> str:
    """
    Retorna a classificação heurística de área.
    Pode ser sobrescrita pela avaliação IA posteriormente.
    """
    text = f"{address or ''} {city or ''}".lower()

    # 1. Keywords de comunidade têm prioridade máxima — são muito específicas
    for kw in COMUNIDADE_KEYWORDS:
        if kw in text:
            return 'comunidade'

    # 2. Keywords de área nobre
    for kw in NOBRE_KEYWORDS:
        if kw in text:
            return 'nobre'

    # 3. Fallback por preço/m² (valor de avaliação = preço de mercado)
    if appraised_value and area_m2 and area_m2 > 0:
        ptam_m2 = appraised_value / area_m2
        tier = _city_tier(city)
        return _price_based(ptam_m2, tier)

    return 'indefinido'
