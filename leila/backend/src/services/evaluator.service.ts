import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 4,
})

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

const SYSTEM_PROMPT = `Você é um analista imobiliário especializado em imóveis para investimento com reforma no Brasil.
Seu trabalho é avaliar imóveis com frieza técnica e precisão de mercado — sem floreios, sem linguagem
de corretor. O usuário vai reformar e vender ou alugar. Ele precisa de números, probabilidades e riscos reais.

Você SEMPRE responde exclusivamente em JSON válido, sem texto antes ou depois, sem markdown, sem blocos de código.
Siga rigorosamente o schema fornecido. Todos os campos são obrigatórios.
Calibre seus valores com base na cidade, bairro e tipo do imóvel informado.
Seja específico — "provavelmente vai valorizar" não é uma análise, é conversa de corretor.
Seja conservador e crítico: oportunidades ruins são muito mais comuns que boas em leilão.

CALIBRAÇÃO REGIONAL DE CUSTOS DE REFORMA (aplique sempre, nunca use valor genérico):
- Interior e cidades pequenas: R$900–1.400/m² (mínimo viável), R$1.500–2.500/m² (reforma completa)
- Capitais e cidades médias (Goiânia, Fortaleza, Recife, Manaus, etc.): R$1.300–2.000/m² (mínimo), R$2.500–4.000/m² (completo)
- Grandes centros (SP, RJ, BSB, Curitiba, POA, BH): R$1.800–3.000/m² (mínimo), R$4.000–7.000/m²+ (completo)
Usar custo de reforma fora da faixa da cidade invalida toda a análise financeira.`

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

export const evaluateProperty = async (property: {
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
  description: string | null
  edital_url?: string | null
  source_name: string
  auction_modality: string | null
}): Promise<PropertyEvaluation> => {

  const endereco = [property.address, property.city, property.state].filter(Boolean).join(', ') || 'Não informado'
  const tipo = property.property_type ?? 'não informado'
  const area_m2 = property.area_m2 ? `${property.area_m2}` : 'não informado'

  const modality = property.auction_modality ? (MODALITY_INFO[property.auction_modality] ?? null) : null
  const modalityLine = modality
    ? `- Modalidade: ${modality.label} — ${modality.nota}`
    : '- Modalidade: não informada'

  const infoExtra = [
    property.description ? `Descrição: ${property.description}` : null,
    property.appraised_value ? `Valor de avaliação (PTAM): R$ ${property.appraised_value.toLocaleString('pt-BR')}` : null,
    property.discount_pct != null ? `Desconto sobre avaliação: ${property.discount_pct.toFixed(1)}%` : null,
    property.edital_url ? `Edital: ${property.edital_url}` : null,
    `Fonte do leilão: ${property.source_name}`,
  ].filter(Boolean).join('\n')

  const userPrompt = `Analise este imóvel para investimento com reforma e retorne APENAS o JSON abaixo preenchido.

DADOS DO IMÓVEL:
- Endereço / Região: ${endereco}
- Tipo: ${tipo}
- Área: ${area_m2} m²
- Estado atual: inferir com base na descrição e tipo (imóvel proveniente de leilão)
- Preço pedido / lance mínimo: R$ ${property.auction_price.toLocaleString('pt-BR')}
${modalityLine}
- Objetivo do investidor: ambos (venda e aluguel)
- Informações adicionais: ${infoExtra || 'nenhuma'}

CRITÉRIO OBRIGATÓRIO PARA VEREDICTO — avalie TODOS os fatores, não apenas preço:
- COMPRAR (score ≥ 70): preço pedido ≤ preço justo estimado, nenhum risco ALTO em Legal ou Estrutural, liquidez da região ALTA ou MÉDIA, ao menos uma estratégia (venda ou aluguel) supera o CDI, modalidade com preço previsível (compra_direta ou segunda_praca preferencialmente).
- NEGOCIAR (score 45–69): preço acima do justo mas com margem real de negociação > 10%, OU riscos MÉDIOS gerenciáveis, OU yield marginal vs CDI, OU modalidade competitiva que pode elevar o preço. Só indique NEGOCIAR se existe condição real para melhorar o negócio.
- EVITAR (score < 45): qualquer risco ALTO em Legal ou Estrutural com probabilidade > 35%, OU preço pedido > 15% acima do preço justo sem margem negociável, OU área com liquidez BAIXA + tendência de queda, OU modalidade de leilão onde preço final esperado elimina a margem, OU desconto insuficiente para cobrir custos de transação + reforma.
Seja conservador: em caso de dúvida, prefira EVITAR. Imóvel de leilão sem desconto real não é oportunidade.

SCHEMA JSON OBRIGATÓRIO:

{
  "resumo_executivo": {
    "veredicto": "COMPRAR | NEGOCIAR | EVITAR",
    "score_geral": <0-100>,
    "frase_decisiva": "<uma linha que resume o por quê do veredicto, sem rodeios>"
  },
  "preco_justo": {
    "valor_minimo_regiao": <número em reais>,
    "valor_mediano_regiao": <número em reais>,
    "valor_maximo_regiao": <número em reais>,
    "preco_justo_este_imovel": <número em reais>,
    "preco_pedido": <número em reais>,
    "percentual_acima_abaixo_mercado": <número, negativo = abaixo do mercado>,
    "margem_negociacao_estimada_pct": <número percentual recomendado para oferta>
  },
  "potencial_pos_reforma": {
    "custo_reforma_minimo": <número em reais>,
    "custo_reforma_mediano": <número em reais>,
    "custo_reforma_maximo": <número em reais>,
    "valor_imovel_pos_reforma_minimo": <número em reais>,
    "valor_imovel_pos_reforma_mediano": <número em reais>,
    "valor_imovel_pos_reforma_maximo": <número em reais>,
    "ganho_bruto_estimado_minimo": <número>,
    "ganho_bruto_estimado_mediano": <número>,
    "ganho_bruto_estimado_maximo": <número>,
    "roi_bruto_pct": <número percentual — ganho bruto / (compra + reforma)>,
    "prazo_reforma_meses_estimado": <número>
  },
  "analise_aluguel": {
    "aluguel_mensal_minimo_regiao": <número>,
    "aluguel_mensal_mediano_regiao": <número>,
    "aluguel_mensal_maximo_regiao": <número>,
    "aluguel_esperado_pos_reforma": <número>,
    "yield_bruto_anual_pct": <número — aluguel anual / valor do imóvel reformado>,
    "vacancia_media_regiao_meses": <número>,
    "tempo_absorcao_mercado_dias": <número estimado para alugar após reforma>
  },
  "viabilidade_financeira": {
    "investimento_total_estimado": <compra + reforma mediana>,
    "payback_venda_meses": <número>,
    "payback_aluguel_anos": <número>,
    "tir_estimada_venda_pct": <número — taxa interna de retorno anualizada>,
    "tir_estimada_aluguel_pct": <número — considerando 10 anos de aluguel + venda>,
    "comparativo_cdi_atual_pct": 14.75,
    "supera_cdi": <true | false — para a melhor estratégia entre venda e aluguel>
  },
  "riscos": [
    {
      "categoria": "<Legal | Estrutural | Mercado | Liquidez | Regulatório | Reforma | Vizinhança>",
      "descricao": "<descrição objetiva do risco>",
      "severidade": "ALTO | MÉDIO | BAIXO",
      "probabilidade_pct": <número>,
      "mitigacao": "<ação concreta para reduzir o risco>"
    }
  ],
  "indicadores_mercado": {
    "liquidez_regiao": "ALTA | MÉDIA | BAIXA",
    "demanda_locacao": "ALTA | MÉDIA | BAIXA",
    "tendencia_preco_12m": "SUBINDO | ESTÁVEL | CAINDO",
    "variacao_preco_12m_estimada_pct": <número>,
    "perfil_comprador_alvo": "<descrição do perfil>",
    "concorrencia_oferta_similar": "ALTA | MÉDIA | BAIXA",
    "tempo_medio_venda_regiao_dias": <número>
  },
  "checklist_due_diligence": [
    {
      "item": "<nome do item>",
      "prioridade": "CRÍTICO | IMPORTANTE | RECOMENDADO",
      "observacao": "<o que verificar especificamente>"
    }
  ],
  "recomendacao_reforma": {
    "escopo_minimo": "<o mínimo para valorizar e vender/alugar>",
    "escopo_recomendado": "<reforma ideal custo-benefício>",
    "itens_alto_impacto": ["<item 1>", "<item 2>", "<item 3>"],
    "itens_evitar": ["<item que não compensa o investimento>"],
    "alerta_reforma": "<risco específico de reforma neste tipo/região>"
  },
  "metadata": {
    "regiao_referencia": "<cidade e bairro usados como base>",
    "confianca_analise": "ALTA | MÉDIA | BAIXA",
    "ressalvas": "<o que pode mudar esta análise>"
  }
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  const stripped = content.text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse JSON from evaluation response')

  const analysis = JSON.parse(jsonMatch[0]) as InvestmentAnalysis

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
    price_per_m2: property.area_m2 && property.area_m2 > 0
      ? Math.round(property.auction_price / property.area_m2)
      : null,
    financial_data: analysis,
  }
}
