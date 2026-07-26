import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export type LlmProvider = 'anthropic' | 'openrouter'

export interface LlmConfig {
  provider: LlmProvider
  model: string
}

const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
}

// Lazy singletons — instanciados apenas quando usados
let _anthropic: Anthropic | null = null
let _openrouter: OpenAI | null = null

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 })
  }
  return _anthropic
}

function getOpenRouterClient(): OpenAI {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    })
  }
  return _openrouter
}

async function callLlm(system: string, user: string, config: LlmConfig): Promise<string> {
  if (config.provider === 'openrouter') {
    const client = getOpenRouterClient()
    const res = await client.chat.completions.create({
      model: config.model,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    return res.choices[0]?.message?.content ?? ''
  }

  // Default: Anthropic
  const client = getAnthropicClient()
  const res = await client.messages.create({
    model: config.model,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic')
  return block.text
}

export interface InvestmentAnalysis {
  resumo_executivo: {
    veredicto: 'COMPRAR' | 'NEGOCIAR' | 'EVITAR'
    score_geral: number
    frase_decisiva: string
  }
  preco_justo: {
    valor_minimo_regiao: number
    valor_mediano_regiao: number
    valor_maximo_regiao: number
    preco_justo_este_imovel: number
    preco_pedido: number
    percentual_acima_abaixo_mercado: number
    margem_negociacao_estimada_pct: number
  }
  potencial_pos_reforma: {
    custo_reforma_minimo: number
    custo_reforma_mediano: number
    custo_reforma_maximo: number
    valor_imovel_pos_reforma_minimo: number
    valor_imovel_pos_reforma_mediano: number
    valor_imovel_pos_reforma_maximo: number
    ganho_bruto_estimado_minimo: number
    ganho_bruto_estimado_mediano: number
    ganho_bruto_estimado_maximo: number
    roi_bruto_pct: number
    prazo_reforma_meses_estimado: number
  }
  analise_aluguel: {
    aluguel_mensal_minimo_regiao: number
    aluguel_mensal_mediano_regiao: number
    aluguel_mensal_maximo_regiao: number
    aluguel_esperado_pos_reforma: number
    yield_bruto_anual_pct: number
    vacancia_media_regiao_meses: number
    tempo_absorcao_mercado_dias: number
  }
  viabilidade_financeira: {
    custos_transacao: {
      itbi: number
      comissao_leiloeiro: number
      registro_cartorio: number
      total: number
    }
    investimento_total_estimado: number
    payback_venda_meses: number
    payback_aluguel_anos: number
    tir_estimada_venda_pct: number
    tir_estimada_aluguel_pct: number
    comparativo_cdi_atual_pct: number
    supera_cdi: boolean
  }
  riscos: Array<{
    categoria: string
    descricao: string
    severidade: 'ALTO' | 'MÉDIO' | 'BAIXO'
    probabilidade_pct: number
    mitigacao: string
  }>
  indicadores_mercado: {
    liquidez_regiao: 'ALTA' | 'MÉDIA' | 'BAIXA'
    demanda_locacao: 'ALTA' | 'MÉDIA' | 'BAIXA'
    tendencia_preco_12m: 'SUBINDO' | 'ESTÁVEL' | 'CAINDO'
    variacao_preco_12m_estimada_pct: number
    perfil_comprador_alvo: string
    concorrencia_oferta_similar: 'ALTA' | 'MÉDIA' | 'BAIXA'
    tempo_medio_venda_regiao_dias: number
  }
  checklist_due_diligence: Array<{
    item: string
    prioridade: 'CRÍTICO' | 'IMPORTANTE' | 'RECOMENDADO'
    observacao: string
  }>
  recomendacao_reforma: {
    escopo_minimo: string
    escopo_recomendado: string
    itens_alto_impacto: string[]
    itens_evitar: string[]
    alerta_reforma: string
  }
  metadata: {
    regiao_referencia: string
    classificacao_regional: 'GRANDE_CENTRO' | 'CAPITAL_MEDIA' | 'INTERIOR'
    confianca_analise: 'ALTA' | 'MÉDIA' | 'BAIXA'
    ressalvas: string
  }
}

// Legacy interface — kept for backward compat with old evaluations already in DB
export interface EvaluationFinancialData {
  estimated_total_cost: number
  total_cost_breakdown: {
    arrematacao: number
    itbi: number
    itbi_pct: number
    registro_cartorio: number
    comissao_leiloeiro: number
    custo_total: number
  }
  market_avg_price_m2: number | null
  price_vs_market_pct: number | null
  rental_estimate_monthly: number | null
  rental_yield_annual_pct: number | null
  financial_verdict: string
  liquidity_assessment: 'alta' | 'media' | 'baixa'
}

export interface PropertyEvaluation {
  score: number
  summary: string
  area_classification: 'nobre' | 'intermediário' | 'popular' | 'comunidade' | 'indefinido'
  location_notes: string
  condition_notes: string
  documents_notes: string
  risks: string[]
  highlights: string[]
  recommendation: 'strong_buy' | 'consider' | 'risky' | 'avoid'
  price_per_m2: number | null
  financial_data: InvestmentAnalysis | null
}

const SYSTEM_PROMPT = `Você é um analista imobiliário especializado em imóveis de leilão no Brasil. Seu trabalho é avaliar imóveis com frieza técnica e precisão de mercado — sem floreios, sem linguagem de corretor. O usuário vai reformar e vender ou alugar. Ele precisa de números reais, probabilidades e riscos concretos.

Você SEMPRE responde exclusivamente em JSON válido, sem texto antes ou depois, sem markdown, sem blocos de código.
Siga rigorosamente o schema fornecido. Todos os campos são obrigatórios.
Calibre seus valores com base na cidade, bairro e tipo do imóvel informado.
Seja conservador: oportunidades ruins são muito mais comuns que boas em leilão.

═══════════════════════════════════════════════════════
CLASSIFICAÇÃO REGIONAL E CUSTOS DE REFORMA
═══════════════════════════════════════════════════════

GRANDE CENTRO — Regiões Metropolitanas das seguintes cidades:
São Paulo, Rio de Janeiro, Brasília/DF, Curitiba, Porto Alegre, Belo Horizonte, Campinas, Goiânia, Florianópolis, Salvador, Recife, Fortaleza, Manaus
Exemplos de municípios da RM que se enquadram: Cachoeirinha-RS, Canoas-RS, São Leopoldo-RS, Novo Hamburgo-RS, Gravataí-RS, Alvorada-RS, Viamão-RS (RM de Porto Alegre); São Bernardo-SP, Osasco-SP, Guarulhos-SP, Santo André-SP (RM de SP); Niterói-RJ, Duque de Caxias-RJ (RM de RJ); Contagem-MG, Betim-MG (RM de BH); São José dos Pinhais-PR (RM de Curitiba).
→ Reforma mínima viável: R$ 1.800–3.000/m²
→ Reforma completa: R$ 4.000–7.000/m²+

CAPITAL OU CIDADE MÉDIA — Capitais não listadas acima ou municípios com 100k–500k hab fora de RM de grande centro:
Natal, Maceió, João Pessoa, Campo Grande, Cuiabá, Teresina, São Luís, Macapá, Porto Velho, Boa Vista, Rio Branco, Palmas, Vitória-ES, Aracaju-SE, Joinville-SC, Uberlândia-MG, Ribeirão Preto-SP, São José do Rio Preto-SP, Londrina-PR, Maringá-PR, Caxias do Sul-RS, Pelotas-RS.
→ Reforma mínima viável: R$ 1.300–2.000/m²
→ Reforma completa: R$ 2.500–4.000/m²

INTERIOR E CIDADES PEQUENAS — Demais municípios (< 100k hab ou cidades pequenas de regiões sem dinamismo econômico):
→ Reforma mínima viável: R$ 900–1.400/m²
→ Reforma completa: R$ 1.500–2.500/m²

ATENÇÃO: Classificar erroneamente a cidade invalida toda a análise financeira.
Cachoeirinha-RS = GRANDE_CENTRO (RM de Porto Alegre). Não use valores de interior.

═══════════════════════════════════════════════════════
CUSTOS DE TRANSAÇÃO — SEMPRE CALCULAR
═══════════════════════════════════════════════════════

Todo imóvel de leilão tem estes custos obrigatórios além do lance:
- ITBI: 2% sobre o valor de avaliação (PTAM) do imóvel — varia por município, use 2% como base
- Comissão do leiloeiro: 5% sobre o lance vencedor (padrão Caixa Econômica e bancos)
- Registro em cartório: ~0,5% do valor do imóvel
- Total esperado: aprox. 7–8% sobre o preço de compra
Estes custos saem do bolso do comprador no ato e NUNCA podem ser ignorados.

═══════════════════════════════════════════════════════
FÓRMULAS MATEMÁTICAS — OBRIGATÓRIAS E EXATAS
═══════════════════════════════════════════════════════

Calcule na seguinte ordem, sem desviar:

1. custos_transacao.itbi = valor_avaliacao × 0,02 (ou preço × 0,02 se sem avaliação)
2. custos_transacao.comissao_leiloeiro = preço_lance × 0,05
3. custos_transacao.registro_cartorio = preço_lance × 0,005
4. custos_transacao.total = itbi + comissao + registro
5. investimento_total (cenário realista) = preço_lance + custos_transacao.total + custo_reforma_mediano
6. ganho_bruto_estimado = valor_imovel_pos_reforma - investimento_total_do_cenário
   - PESSIMISTA: ganho = valor_pós_reforma_mínimo - (lance + custos + reforma_máxima)
   - REALISTA:   ganho = valor_pós_reforma_médio   - (lance + custos + reforma_mediana)
   - OTIMISTA:   ganho = valor_pós_reforma_máximo  - (lance + custos + reforma_mínima)
   GANHO BRUTO PODE SER NEGATIVO — se for, mostre negativo. Nunca omita custos para fazer parecer positivo.
7. roi_bruto_pct = ganho_bruto_realista / investimento_total_realista × 100 (pode ser negativo)
8. yield_bruto_anual_pct = (aluguel_esperado × 12) / valor_imovel_pos_reforma_mediano × 100

Verifique suas contas antes de preencher o JSON. Erros matemáticos invalidam a análise.

═══════════════════════════════════════════════════════
SCORECARD — USE ESTE CRITÉRIO, NENHUM OUTRO
═══════════════════════════════════════════════════════

Score 85–100 → COMPRAR: preço ≥ 20% abaixo do justo, ganho_bruto realista positivo cobrindo todos os custos, liquidez ALTA, zero risco ALTO, reforma viável.
Score 70–84  → COMPRAR: preço ≤ preço justo, ganho_bruto realista positivo, liquidez MÉDIA ou ALTA, sem risco ALTO em Legal ou Estrutural.
Score 55–69  → NEGOCIAR: preço até 10% acima do justo mas com margem real de negociação >8%, OU yield de aluguel supera CDI mesmo com custos, riscos apenas MÉDIOS.
Score 40–54  → NEGOCIAR: preço 10–20% acima do justo ou múltiplos riscos MÉDIOS, ganho marginalmente positivo só no otimista.
Score 25–39  → EVITAR: preço >20% acima do justo, OU ganho_bruto negativo até no otimista, OU risco ALTO com probabilidade >35%.
Score 0–24   → EVITAR: desastre — preço acima do avaliado, múltiplos riscos ALTO, nenhuma estratégia supera CDI.

Evite scores "genéricos" como 70, 72, 75 sem justificativa específica. O score deve refletir os dados calculados.`

const MODALITY_INFO: Record<string, { label: string; nota: string }> = {
  compra_direta: {
    label: 'Compra Direta',
    nota: 'Preço fixo — o valor acima É o preço final, sem concorrência. Use-o diretamente como custo de aquisição.',
  },
  segunda_praca: {
    label: '2ª Praça',
    nota: 'Lance mínimo é ~60% do valor de avaliação. O preço acima é o mínimo; pode haver concorrência. Use como custo base, mas considere que pode subir 5–20% em leilões disputados.',
  },
  leilao_online: {
    label: 'Leilão Online',
    nota: 'Lances em tempo real — o preço acima é o lance mínimo atual, NÃO o preço final. O preço final pode ser significativamente maior dependendo da disputa. Incorpore como risco explícito nos cálculos.',
  },
  primeira_praca: {
    label: '1ª Praça',
    nota: 'Lance mínimo = valor de avaliação. Desconto real é mínimo ou inexistente. O preço acima é o valor de avaliação — analise como se fosse compra a mercado, pois raramente há barganha.',
  },
  proposta_fechada: {
    label: 'Proposta Fechada',
    nota: 'Banco seleciona a melhor oferta entre propostas lacradas. Preço referencial — o banco pode aceitar ou não. Considere que outros compradores podem oferecer mais.',
  },
}

export const evaluateProperty = async (
  property: {
    id: string
    title: string
    address: string | null
    city: string | null
    state: string | null
    property_type: string | null
    auction_price: number
    appraised_value: number | null
    discount_pct: number | null
    area_m2: number | null
    useful_area_m2: number | null
    bedrooms: number | null
    bathrooms: number | null
    parking_spots: number | null
    is_occupied: boolean | null
    description: string | null
    edital_url?: string | null
    source_name: string
    auction_modality: string | null
  },
  config: LlmConfig = DEFAULT_LLM_CONFIG,
): Promise<PropertyEvaluation> => {

  const endereco = [property.address, property.city, property.state].filter(Boolean).join(', ') || 'Não informado'
  const tipo = property.property_type ?? 'não informado'

  // Use a área útil quando disponível e não-zero; fallback para area_m2
  const areaUtil = (property.useful_area_m2 ?? 0) > 0 ? property.useful_area_m2 : null
  const areaTotal = (property.area_m2 ?? 0) > 0 ? property.area_m2 : null
  const areaEfetiva = areaUtil ?? areaTotal
  const area_m2_str = areaEfetiva ? `${areaEfetiva} m²` : 'não informada'
  const area_detalhe = areaUtil && areaTotal && areaUtil !== areaTotal
    ? ` (área privativa: ${areaUtil} m², área total incluindo terreno/comum: ${areaTotal} m²)`
    : ''

  const modality = property.auction_modality ? (MODALITY_INFO[property.auction_modality] ?? null) : null
  const modalityLine = modality
    ? `- Modalidade: ${modality.label} — ${modality.nota}`
    : '- Modalidade: não informada'

  const caracteristicas = [
    property.bedrooms != null ? `${property.bedrooms} quarto(s)` : null,
    property.bathrooms != null ? `${property.bathrooms} banheiro(s)` : null,
    property.parking_spots != null ? `${property.parking_spots} vaga(s)` : null,
    property.is_occupied === true ? 'IMÓVEL OCUPADO (risco de desocupação)' : property.is_occupied === false ? 'Imóvel desocupado' : null,
  ].filter(Boolean).join(', ')

  const infoExtra = [
    property.description ? `Descrição: ${property.description}` : null,
    property.appraised_value ? `Valor de avaliação (PTAM): R$ ${property.appraised_value.toLocaleString('pt-BR')}` : null,
    property.discount_pct != null ? `Desconto sobre avaliação: ${property.discount_pct.toFixed(1)}%` : null,
    property.edital_url ? `Edital: ${property.edital_url}` : null,
    `Fonte do leilão: ${property.source_name}`,
  ].filter(Boolean).join('\n')

  const userPrompt = `Analise este imóvel para investimento com reforma. Retorne APENAS o JSON do schema abaixo, sem texto adicional.

═══════════════════════════════════════════════════════
DADOS DO IMÓVEL
═══════════════════════════════════════════════════════
- Endereço / Região: ${endereco}
- Tipo: ${tipo}
- Área para cálculo de reforma: ${area_m2_str}${area_detalhe}
- Características: ${caracteristicas || 'não informadas'}
- Estado atual: inferir com base na descrição (imóvel proveniente de leilão — provavelmente necessita reforma)
- Preço pedido / lance mínimo: R$ ${property.auction_price.toLocaleString('pt-BR')}
${modalityLine}
- Objetivo do investidor: ambos (venda pós-reforma E locação)
- Informações adicionais:
${infoExtra || 'Nenhuma informação adicional disponível.'}

═══════════════════════════════════════════════════════
INSTRUÇÕES DE CÁLCULO — SIGA À RISCA
═══════════════════════════════════════════════════════
1. Classifique a cidade em GRANDE_CENTRO, CAPITAL_MEDIA ou INTERIOR e aplique a faixa de custo correspondente.
2. Use a ÁREA INFORMADA ACIMA para calcular custo de reforma. Se área não informada, estime pelo tipo e características.
3. Calcule custos de transação: ITBI (2% da avaliação ou preço), leiloeiro (5% do lance), cartório (0,5% do lance).
4. ganho_bruto = valor_pós_reforma - lance - custos_transação - custo_reforma. PODE SER NEGATIVO.
5. Preencha o JSON na ordem do schema.

═══════════════════════════════════════════════════════
SCHEMA JSON OBRIGATÓRIO
═══════════════════════════════════════════════════════

{
  "resumo_executivo": {
    "veredicto": "COMPRAR | NEGOCIAR | EVITAR",
    "score_geral": <0–100, use o scorecard do sistema — evite scores genéricos sem embasamento>,
    "frase_decisiva": "<uma frase direta e específica que resume o veredicto com os números-chave>"
  },
  "preco_justo": {
    "valor_minimo_regiao": <R$ — piso do m² da região × área>,
    "valor_mediano_regiao": <R$ — mediana do m² × área>,
    "valor_maximo_regiao": <R$ — teto do m² × área>,
    "preco_justo_este_imovel": <R$ — considerando tipo, área, bairro e condição estimada>,
    "preco_pedido": <número — igual ao lance mínimo informado>,
    "percentual_acima_abaixo_mercado": <número — (preço_pedido / preco_justo - 1) × 100, negativo = abaixo>,
    "margem_negociacao_estimada_pct": <número — % de desconto possível dado o contexto do leilão>
  },
  "potencial_pos_reforma": {
    "custo_reforma_minimo": <R$ — reforma mínima viável para o imóvel desta área e região>,
    "custo_reforma_mediano": <R$ — reforma completa custo-benefício>,
    "custo_reforma_maximo": <R$ — reforma completa premium>,
    "valor_imovel_pos_reforma_minimo": <R$ — valor de venda estimado após reforma mínima>,
    "valor_imovel_pos_reforma_mediano": <R$ — valor de venda estimado após reforma padrão>,
    "valor_imovel_pos_reforma_maximo": <R$ — valor de venda estimado após reforma premium>,
    "ganho_bruto_estimado_minimo": <R$ — cenário pessimista: valor_pós_mínimo - lance - custos_transação - reforma_máxima>,
    "ganho_bruto_estimado_mediano": <R$ — cenário realista: valor_pós_médio - lance - custos_transação - reforma_mediana>,
    "ganho_bruto_estimado_maximo": <R$ — cenário otimista: valor_pós_máximo - lance - custos_transação - reforma_mínima>,
    "roi_bruto_pct": <número — ganho_bruto_realista / (lance + custos_transação + reforma_mediana) × 100, pode ser negativo>,
    "prazo_reforma_meses_estimado": <número>
  },
  "analise_aluguel": {
    "aluguel_mensal_minimo_regiao": <R$>,
    "aluguel_mensal_mediano_regiao": <R$>,
    "aluguel_mensal_maximo_regiao": <R$>,
    "aluguel_esperado_pos_reforma": <R$ — aluguel realista pós-reforma para este imóvel>,
    "yield_bruto_anual_pct": <número — aluguel_esperado × 12 / valor_pós_reforma_mediano × 100>,
    "vacancia_media_regiao_meses": <número — meses/ano em média sem inquilino>,
    "tempo_absorcao_mercado_dias": <número — dias médios para locar após reforma>
  },
  "viabilidade_financeira": {
    "custos_transacao": {
      "itbi": <R$ — 2% sobre valor de avaliação ou lance se sem avaliação>,
      "comissao_leiloeiro": <R$ — 5% sobre o lance>,
      "registro_cartorio": <R$ — 0,5% sobre o lance>,
      "total": <R$ — soma dos três>
    },
    "investimento_total_estimado": <R$ — lance + custos_transacao.total + custo_reforma_mediano>,
    "payback_venda_meses": <número — prazo estimado até venda + reforma concluída>,
    "payback_aluguel_anos": <número — anos para recuperar investimento_total via aluguel líquido>,
    "tir_estimada_venda_pct": <número — TIR anualizada da estratégia de venda>,
    "tir_estimada_aluguel_pct": <número — TIR anualizada considerando 10 anos de aluguel + venda residual>,
    "comparativo_cdi_atual_pct": 14.75,
    "supera_cdi": <true | false — melhor estratégia supera CDI?>
  },
  "riscos": [
    {
      "categoria": "<Legal | Estrutural | Mercado | Liquidez | Regulatório | Reforma | Ocupação | Vizinhança>",
      "descricao": "<descrição objetiva e específica do risco para este imóvel>",
      "severidade": "ALTO | MÉDIO | BAIXO",
      "probabilidade_pct": <número 0–100>,
      "mitigacao": "<ação concreta e viável para reduzir este risco>"
    }
  ],
  "indicadores_mercado": {
    "liquidez_regiao": "ALTA | MÉDIA | BAIXA",
    "demanda_locacao": "ALTA | MÉDIA | BAIXA",
    "tendencia_preco_12m": "SUBINDO | ESTÁVEL | CAINDO",
    "variacao_preco_12m_estimada_pct": <número>,
    "perfil_comprador_alvo": "<descrição específica do perfil — renda, família, uso>",
    "concorrencia_oferta_similar": "ALTA | MÉDIA | BAIXA",
    "tempo_medio_venda_regiao_dias": <número>
  },
  "checklist_due_diligence": [
    {
      "item": "<nome do item>",
      "prioridade": "CRÍTICO | IMPORTANTE | RECOMENDADO",
      "observacao": "<o que verificar especificamente neste imóvel>"
    }
  ],
  "recomendacao_reforma": {
    "escopo_minimo": "<o mínimo indispensável para vender/alugar este tipo de imóvel>",
    "escopo_recomendado": "<reforma ideal custo-benefício para o perfil do comprador>",
    "itens_alto_impacto": ["<item 1>", "<item 2>", "<item 3>"],
    "itens_evitar": ["<item que não compensa o investimento neste caso>"],
    "alerta_reforma": "<risco específico de reforma para este imóvel/região — ex: umidade, estrutura, acabamento>"
  },
  "metadata": {
    "regiao_referencia": "<cidade e bairro/região usados como base para os cálculos>",
    "classificacao_regional": "GRANDE_CENTRO | CAPITAL_MEDIA | INTERIOR",
    "confianca_analise": "ALTA | MÉDIA | BAIXA",
    "ressalvas": "<o que pode alterar significativamente esta análise — ex: condição real do imóvel, ocupação, pendências>"
  }
}`

  const rawText = await callLlm(SYSTEM_PROMPT, userPrompt, config)

  const stripped = rawText.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse JSON from evaluation response')

  const rawAnalysis = JSON.parse(jsonMatch[0]) as InvestmentAnalysis

  // ── Math correction: ensure financial figures are internally consistent ──────
  const analysis = correctFinancialMath(rawAnalysis, property.auction_price, property.appraised_value)

  const verdictMap: Record<string, 'strong_buy' | 'consider' | 'risky' | 'avoid'> = {
    COMPRAR: 'strong_buy',
    NEGOCIAR: 'consider',
    EVITAR: 'avoid',
  }

  const criticalDocs = analysis.checklist_due_diligence
    ?.filter(i => i.prioridade === 'CRÍTICO')
    .map(i => i.item)
    .join('; ') || ''

  return {
    score: Math.min(10, Math.max(0, (analysis.resumo_executivo?.score_geral ?? 0) / 10)),
    summary: analysis.resumo_executivo?.frase_decisiva ?? '',
    area_classification: 'indefinido',
    location_notes: [
      analysis.metadata?.regiao_referencia,
      analysis.indicadores_mercado?.perfil_comprador_alvo,
    ].filter(Boolean).join(' — '),
    condition_notes: analysis.recomendacao_reforma?.escopo_recomendado ?? '',
    documents_notes: criticalDocs,
    risks: analysis.riscos?.map(r => r.descricao) ?? [],
    highlights: analysis.recomendacao_reforma?.itens_alto_impacto ?? [],
    recommendation: verdictMap[analysis.resumo_executivo?.veredicto] ?? 'consider',
    price_per_m2: areaEfetiva && areaEfetiva > 0
      ? Math.round(property.auction_price / areaEfetiva)
      : null,
    financial_data: analysis,
  }
}

/**
 * Corrects financial math to ensure internal consistency.
 * The LLM sometimes makes arithmetic errors in multi-step calculations.
 * This function recalculates derived values from their component parts.
 */
function correctFinancialMath(
  analysis: InvestmentAnalysis,
  auctionPrice: number,
  appraisedValue: number | null,
): InvestmentAnalysis {
  const viab = analysis.viabilidade_financeira
  const reforma = analysis.potencial_pos_reforma

  if (!viab || !reforma) return analysis

  // 1. Recalculate transaction costs from base values
  const baseForItbi = appraisedValue && appraisedValue > 0 ? appraisedValue : auctionPrice
  const itbi = Math.round(baseForItbi * 0.02)
  const comissao = Math.round(auctionPrice * 0.05)
  const registro = Math.round(auctionPrice * 0.005)
  const totalCustos = itbi + comissao + registro

  if (viab.custos_transacao) {
    // Only override if the LLM values are wildly wrong (>50% off)
    const llmTotal = viab.custos_transacao.total ?? 0
    if (Math.abs(llmTotal - totalCustos) / Math.max(totalCustos, 1) > 0.5) {
      viab.custos_transacao = { itbi, comissao_leiloeiro: comissao, registro_cartorio: registro, total: totalCustos }
    }
  } else {
    viab.custos_transacao = { itbi, comissao_leiloeiro: comissao, registro_cartorio: registro, total: totalCustos }
  }

  const custos = viab.custos_transacao.total

  // 2. Recalculate investimento_total from components
  const investimentoCorreto = auctionPrice + custos + (reforma.custo_reforma_mediano ?? 0)
  if (viab.investimento_total_estimado && Math.abs(viab.investimento_total_estimado - investimentoCorreto) / Math.max(investimentoCorreto, 1) > 0.15) {
    viab.investimento_total_estimado = investimentoCorreto
  }

  // 3. Recalculate ganho_bruto for each scenario
  if (reforma.custo_reforma_maximo != null && reforma.valor_imovel_pos_reforma_minimo != null) {
    const ganhoMin = reforma.valor_imovel_pos_reforma_minimo - auctionPrice - custos - reforma.custo_reforma_maximo
    if (Math.abs((reforma.ganho_bruto_estimado_minimo ?? 0) - ganhoMin) / (Math.abs(ganhoMin) + 1) > 0.15) {
      reforma.ganho_bruto_estimado_minimo = Math.round(ganhoMin)
    }
  }
  if (reforma.custo_reforma_mediano != null && reforma.valor_imovel_pos_reforma_mediano != null) {
    const ganhoMed = reforma.valor_imovel_pos_reforma_mediano - auctionPrice - custos - reforma.custo_reforma_mediano
    if (Math.abs((reforma.ganho_bruto_estimado_mediano ?? 0) - ganhoMed) / (Math.abs(ganhoMed) + 1) > 0.15) {
      reforma.ganho_bruto_estimado_mediano = Math.round(ganhoMed)
    }
  }
  if (reforma.custo_reforma_minimo != null && reforma.valor_imovel_pos_reforma_maximo != null) {
    const ganhoMax = reforma.valor_imovel_pos_reforma_maximo - auctionPrice - custos - reforma.custo_reforma_minimo
    if (Math.abs((reforma.ganho_bruto_estimado_maximo ?? 0) - ganhoMax) / (Math.abs(ganhoMax) + 1) > 0.15) {
      reforma.ganho_bruto_estimado_maximo = Math.round(ganhoMax)
    }
  }

  // 4. Recalculate ROI from corrected values
  if (reforma.ganho_bruto_estimado_mediano != null && viab.investimento_total_estimado > 0) {
    const roiCorreto = (reforma.ganho_bruto_estimado_mediano / viab.investimento_total_estimado) * 100
    if (Math.abs((reforma.roi_bruto_pct ?? 0) - roiCorreto) > 5) {
      reforma.roi_bruto_pct = parseFloat(roiCorreto.toFixed(1))
    }
  }

  return analysis
}
