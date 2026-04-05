import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  location_notes: string
  condition_notes: string
  documents_notes: string
  risks: string[]
  highlights: string[]
  recommendation: 'strong_buy' | 'consider' | 'risky' | 'avoid'
  price_per_m2: number | null
  financial_data: EvaluationFinancialData | null
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
}): Promise<PropertyEvaluation> => {

  const pricePerM2 = property.area_m2 && property.area_m2 > 0
    ? (property.auction_price / property.area_m2).toFixed(2)
    : 'N/D'

  const appraised = property.appraised_value
    ? `R$ ${property.appraised_value.toLocaleString('pt-BR')}`
    : 'N/D'

  const prompt = `Você é um analista sênior de investimentos imobiliários especializado em leilões judiciais e extrajudiciais no Brasil, com expertise em precificação de mercado, análise de risco jurídico e avaliação de retorno sobre investimento.

## DADOS DO IMÓVEL

- **Fonte**: ${property.source_name}
- **Título**: ${property.title}
- **Endereço**: ${[property.address, property.city, property.state].filter(Boolean).join(', ') || 'N/D'}
- **Tipo**: ${property.property_type ?? 'N/D'}
- **Área**: ${property.area_m2 ? `${property.area_m2} m²` : 'N/D'}
- **Valor de Avaliação (PTAM)**: ${appraised}
- **Preço Mínimo de Lance**: R$ ${property.auction_price.toLocaleString('pt-BR')}
- **Desconto sobre Avaliação**: ${property.discount_pct != null ? `${property.discount_pct.toFixed(1)}%` : 'N/D'}
- **Preço/m² no lance**: ${pricePerM2 !== 'N/D' ? `R$ ${Number(pricePerM2).toLocaleString('pt-BR')}` : 'N/D'}
- **Descrição**: ${property.description ?? 'Sem descrição disponível.'}
${property.edital_url ? `- **Edital**: ${property.edital_url}` : ''}

## INSTRUÇÕES DE ANÁLISE

Realize uma avaliação técnica completa usando os seguintes critérios:

### 1. METODOLOGIA DE PRECIFICAÇÃO
- Compare o preço/m² do lance com a média de mercado para o tipo de imóvel na cidade/região (use seu conhecimento de mercado imobiliário brasileiro)
- Calcule o custo total de aquisição: arrematação + ITBI (use 3% como base, variável por município) + registro em cartório (~1,5% ou mínimo R$ 1.500) + comissão do leiloeiro (5% sobre o lance, pago pelo arrematante)
- Estime o potencial de aluguel mensal com base no tipo, área e localização
- Calcule o yield bruto anual = (aluguel mensal × 12) / custo total de aquisição × 100
- Avalie a liquidez do imóvel (alta = apartamento residencial em capital, media = casa/comercial em cidade média, baixa = terreno/industrial/cidade pequena)

### 2. ANÁLISE DE LOCALIZAÇÃO
- Avalie o potencial da cidade e bairro (se identificável)
- Considere fatores de valorização, infraestrutura, mercado local
- Identifique se é capital, região metropolitana ou interior

### 3. ANÁLISE DAS CONDIÇÕES
- Com base na descrição e tipo, estime o estado do imóvel
- Identifique se está ocupado (risco de desocupação judicial)
- Estime custo de reforma se necessário

### 4. ANÁLISE DOCUMENTAL E JURÍDICA
- Avalie o tipo de leilão (judicial/extrajudicial, 1ª/2ª praça)
- Identifique riscos jurídicos (dívidas de condomínio, IPTU, ônus reais)
- Avalie a segurança do título

### 5. CRITÉRIOS DE SCORE
- **9-10**: Excelente oportunidade — desconto > 40%, localização premium, baixo risco jurídico, yield > 8%
- **7-8**: Boa oportunidade — desconto 25-40%, boa localização, riscos gerenciáveis
- **5-6**: Regular — desconto < 25% ou riscos moderados, yield abaixo de 6%
- **3-4**: Arriscado — problemas jurídicos relevantes, localização fraca ou imóvel com problemas sérios
- **0-2**: Evitar — alto risco jurídico, imóvel com problemas graves ou preço acima do mercado

## FORMATO DE RESPOSTA

Responda APENAS com JSON válido neste formato exato (sem markdown, sem texto antes ou depois):

{
  "score": <número decimal 0.0-10.0>,
  "summary": "<parágrafo executivo de 2-3 frases destacando os pontos mais relevantes da oportunidade>",
  "location_notes": "<análise detalhada da localização, mercado local, potencial de valorização e comparação regional>",
  "condition_notes": "<análise das condições físicas estimadas, ocupação, necessidade de reforma, riscos estruturais>",
  "documents_notes": "<análise jurídica: tipo de praça, origem da dívida, riscos de ônus, segurança do título>",
  "risks": [
    "<risco específico e acionável 1>",
    "<risco específico e acionável 2>",
    "<risco específico e acionável 3>"
  ],
  "highlights": [
    "<ponto positivo concreto 1>",
    "<ponto positivo concreto 2>",
    "<ponto positivo concreto 3>"
  ],
  "recommendation": "<strong_buy|consider|risky|avoid>",
  "price_per_m2": <número ou null se área desconhecida>,
  "financial_data": {
    "estimated_total_cost": <lance + ITBI + registro + comissão leiloeiro>,
    "total_cost_breakdown": {
      "arrematacao": <valor do lance>,
      "itbi": <valor estimado ITBI 3%>,
      "itbi_pct": 3.0,
      "registro_cartorio": <valor estimado registro>,
      "comissao_leiloeiro": <5% do lance>,
      "custo_total": <soma de tudo>
    },
    "market_avg_price_m2": <preço médio/m² estimado para o tipo e cidade, ou null>,
    "price_vs_market_pct": <percentual abaixo(-) ou acima(+) do mercado, ou null>,
    "rental_estimate_monthly": <aluguel mensal estimado em R$, ou null>,
    "rental_yield_annual_pct": <yield bruto anual %, ou null>,
    "financial_verdict": "<parágrafo técnico de 2-4 frases com a análise financeira completa: custo total, comparação de mercado e retorno estimado>",
    "liquidity_assessment": "<alta|media|baixa>"
  }
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  // Strip markdown code fences if present, then extract JSON
  const stripped = content.text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse JSON from evaluation response')

  return JSON.parse(jsonMatch[0]) as PropertyEvaluation
}
