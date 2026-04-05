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
  area_classification: 'nobre' | 'intermediário' | 'popular' | 'comunidade' | 'indefinido'
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

  const prompt = `Você é um analista sênior de investimentos imobiliários em leilões no Brasil. Responda de forma técnica, direta e objetiva — sem introduções, sem enrolação.

## DADOS

- Fonte: ${property.source_name}
- Título: ${property.title}
- Endereço: ${[property.address, property.city, property.state].filter(Boolean).join(', ') || 'N/D'}
- Tipo: ${property.property_type ?? 'N/D'}
- Área: ${property.area_m2 ? `${property.area_m2} m²` : 'N/D'}
- Avaliação (PTAM): ${appraised}
- Lance mínimo: R$ ${property.auction_price.toLocaleString('pt-BR')}
- Desconto: ${property.discount_pct != null ? `${property.discount_pct.toFixed(1)}%` : 'N/D'}
- Preço/m²: ${pricePerM2 !== 'N/D' ? `R$ ${Number(pricePerM2).toLocaleString('pt-BR')}` : 'N/D'}
- Descrição: ${property.description ?? 'Sem descrição.'}
${property.edital_url ? `- Edital: ${property.edital_url}` : ''}

## ANÁLISE REQUERIDA

1. **Precificação**: Compare preço/m² com mercado local. Calcule custo total (lance + ITBI 3% + cartório ~1,5% + comissão leiloeiro 5%). Estime aluguel mensal e yield bruto anual.

2. **Localização**: Identifique capital/região metropolitana/interior. Classifique o perfil do bairro como: nobre (alta renda, valorização histórica), intermediário (classe média, infraestrutura boa), popular (classe baixa/média-baixa, infraestrutura básica), ou comunidade (área de favela, invasão ou alta vulnerabilidade).

3. **Condição**: Estime estado físico com base no tipo e descrição. Identifique ocupação e necessidade de reforma.

4. **Jurídico**: Avalie tipo de praça, origem da dívida, riscos de ônus e segurança do título.

## CRITÉRIOS DE SCORE
- 9-10: Desconto >40%, localização premium, baixo risco jurídico, yield >8%
- 7-8: Desconto 25-40%, boa localização, riscos gerenciáveis
- 5-6: Desconto <25% ou risco moderado, yield <6%
- 3-4: Problemas jurídicos relevantes ou localização fraca
- 0-2: Alto risco jurídico, preço acima do mercado ou problemas graves

## FORMATO DE RESPOSTA

JSON válido apenas (sem markdown, sem texto fora do JSON):

{
  "score": <0.0-10.0>,
  "summary": "<2 frases técnicas e diretas: principal atrativo/risco e veredicto>",
  "area_classification": "<nobre|intermediário|popular|comunidade|indefinido>",
  "location_notes": "<1-2 frases: tipo da cidade, perfil do bairro, potencial de valorização>",
  "condition_notes": "<1-2 frases: estado estimado, ocupação, reforma necessária>",
  "documents_notes": "<1-2 frases: tipo de praça/leilão, nível de risco jurídico, ônus relevantes>",
  "risks": ["<risco acionável 1>", "<risco acionável 2>", "<risco acionável 3>"],
  "highlights": ["<ponto positivo concreto 1>", "<ponto positivo concreto 2>", "<ponto positivo concreto 3>"],
  "recommendation": "<strong_buy|consider|risky|avoid>",
  "price_per_m2": <número ou null>,
  "financial_data": {
    "estimated_total_cost": <lance + ITBI + cartório + comissão>,
    "total_cost_breakdown": {
      "arrematacao": <valor do lance>,
      "itbi": <ITBI 3%>,
      "itbi_pct": 3.0,
      "registro_cartorio": <estimativa cartório>,
      "comissao_leiloeiro": <5% do lance>,
      "custo_total": <soma total>
    },
    "market_avg_price_m2": <preço médio/m² estimado para tipo+cidade, ou null>,
    "price_vs_market_pct": <% abaixo(-) ou acima(+) do mercado, ou null>,
    "rental_estimate_monthly": <aluguel mensal estimado em R$, ou null>,
    "rental_yield_annual_pct": <yield bruto anual %, ou null>,
    "financial_verdict": "<2 frases: custo total real vs mercado, yield estimado e veredicto financeiro>",
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
