import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface PropertyEvaluation {
  score: number // 0-10
  summary: string
  location_notes: string
  condition_notes: string
  documents_notes: string
  risks: string[]
  highlights: string[]
  recommendation: 'strong_buy' | 'consider' | 'risky' | 'avoid'
}

export const evaluateProperty = async (property: {
  id: string
  title: string
  address: string
  city: string
  state: string
  property_type: string
  auction_price: number
  appraised_value: number
  discount_pct: number
  description: string
  edital_url?: string
  source_name: string
}): Promise<PropertyEvaluation> => {
  const prompt = `Você é um especialista em avaliação de imóveis de leilão brasileiro. Analise o imóvel abaixo e gere uma avaliação estruturada.

## Imóvel
- **Fonte**: ${property.source_name}
- **Título**: ${property.title}
- **Endereço**: ${property.address}, ${property.city} - ${property.state}
- **Tipo**: ${property.property_type}
- **Valor de Avaliação**: R$ ${property.appraised_value?.toLocaleString('pt-BR') ?? 'N/D'}
- **Preço de Lance**: R$ ${property.auction_price.toLocaleString('pt-BR')}
- **Desconto**: ${property.discount_pct?.toFixed(1) ?? 'N/D'}%
- **Descrição**: ${property.description}
${property.edital_url ? `- **Edital**: ${property.edital_url}` : ''}

## Instruções
Responda APENAS com JSON válido neste formato exato:
{
  "score": <número 0-10>,
  "summary": "<resumo em 2-3 frases>",
  "location_notes": "<análise da localização>",
  "condition_notes": "<análise das condições do imóvel>",
  "documents_notes": "<análise documental e situação jurídica>",
  "risks": ["<risco 1>", "<risco 2>"],
  "highlights": ["<ponto positivo 1>", "<ponto positivo 2>"],
  "recommendation": "<strong_buy|consider|risky|avoid>"
}

Critérios de score: 9-10 excelente oportunidade, 7-8 boa, 5-6 regular, 3-4 arriscado, 0-2 evitar.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  const jsonMatch = content.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse JSON from evaluation response')

  return JSON.parse(jsonMatch[0]) as PropertyEvaluation
}
