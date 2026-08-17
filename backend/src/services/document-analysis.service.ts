import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'

type FindingStatus = 'allowed' | 'not_allowed' | 'conditional' | 'not_found'
type OccupancyStatus = 'occupied' | 'vacant' | 'unknown'

export interface EvidenceItem {
  field: string
  excerpt: string
}
export interface DocumentAnalysis {
  summary: string
  fgts: { status: FindingStatus; note: string }
  financing: { status: FindingStatus; note: string }
  occupancy: { status: OccupancyStatus; note: string }
  condominium_debt: { status: FindingStatus; responsibility: string; note: string }
  tax_debt: { status: FindingStatus; responsibility: string; note: string }
  payment_methods: string[]
  risks: Array<{ severity: 'high' | 'medium' | 'low'; title: string; detail: string }>
  confidence: 'high' | 'medium' | 'low'
}

export interface DocumentAnalysisResult {
  status: 'done' | 'unavailable'
  documentHash: string
  provider: string
  model: string
  tags: string[]
  analysis: DocumentAnalysis
  evidence: EvidenceItem[]
  inputTokens: number
  outputTokens: number
}

const PROMPT_VERSION = 'document-v1'
const OPENROUTER_MODEL = process.env.DOCUMENT_AI_MODEL || 'qwen/qwen3.5-9b'
const ANTHROPIC_MODEL = process.env.DOCUMENT_AI_FALLBACK_MODEL || 'claude-haiku-4-5-20251001'
const ALLOWED_HOSTS = new Set([
  'venda-imoveis.caixa.gov.br',
  'www.caixa.gov.br',
  'caixa.gov.br',
  'www.santander.com.br',
  'santander.com.br',
  'www.itau.com.br',
  'itau.com.br',
  'www.bb.com.br',
  'bb.com.br',
])

const findingStatuses = new Set<FindingStatus>(['allowed', 'not_allowed', 'conditional', 'not_found'])
const occupancyStatuses = new Set<OccupancyStatus>(['occupied', 'vacant', 'unknown'])

function safeSourceUrl(value: string): URL {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Fonte documental não autorizada')
  }
  return parsed
}

function compactSource(markdown: string): string {
  const unavailableMarker = 'O imóvel que você procura não está mais disponível para venda.'
  if (markdown.includes(unavailableMarker)) return unavailableMarker

  const anchors = ['Valor de avaliação:', 'Valor mínimo de venda:', 'Dados do imóvel']
  const start = anchors.map(anchor => markdown.indexOf(anchor)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0
  const endCandidates = ['Corretores credenciados', 'Melhor crédito para você', '[Topo]']
    .map(anchor => markdown.indexOf(anchor, start + 100))
    .filter(index => index > start)
    .sort((a, b) => a - b)
  const end = endCandidates[0] ?? Math.min(markdown.length, start + 24_000)

  return markdown
    .slice(start, end)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 24_000)
}

async function fetchOfficialSnapshot(sourceUrl: string): Promise<string> {
  const parsed = safeSourceUrl(sourceUrl)
  const readerUrl = `https://r.jina.ai/${parsed.toString()}`
  const response = await fetch(readerUrl, {
    headers: { Accept: 'text/plain', 'User-Agent': 'LeilaRadar/1.0' },
    signal: AbortSignal.timeout(35_000),
  })
  if (!response.ok) throw new Error(`Fonte documental respondeu ${response.status}`)
  const text = await response.text()
  if (!text.trim()) throw new Error('Fonte documental sem conteúdo legível')
  return compactSource(text)
}

function sentenceContaining(text: string, pattern: RegExp): string | null {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  return lines.find(line => pattern.test(line))?.slice(0, 520) ?? null
}

function evidence(field: string, excerpt: string | null): EvidenceItem[] {
  return excerpt ? [{ field, excerpt }] : []
}

function rulesAnalysis(text: string): { analysis: DocumentAnalysis; evidence: EvidenceItem[] } {
  const fgtsLine = sentenceContaining(text, /(?:permite|aceita|não permite|não aceita).*fgts|fgts.*(?:permit|aceit)/i)
  const financingLine = sentenceContaining(text, /(?:permite|aceita|não permite|não aceita).*financiamento|financiamento.*(?:permit|aceit)/i)
  const condominiumLine = sentenceContaining(text, /condom[ií]nio:/i)
  const taxLine = sentenceContaining(text, /tributos?:|iptu:/i)
  const occupiedLine = sentenceContaining(text, /\bdesocupad[oa]\b|\bocupad[oa]\b/i)
  const ownResourcesLine = sentenceContaining(text, /recursos pr[oó]prios/i)

  const fgtsStatus: FindingStatus = !fgtsLine
    ? 'not_found'
    : /não (?:permite|aceita)/i.test(fgtsLine) ? 'not_allowed'
      : /consulte|condiç|somente/i.test(fgtsLine) ? 'conditional' : 'allowed'
  const financingStatus: FindingStatus = !financingLine
    ? 'not_found'
    : /não (?:permite|aceita)/i.test(financingLine) ? 'not_allowed'
      : /consulte|condiç|somente/i.test(financingLine) ? 'conditional' : 'allowed'
  const occupancyStatus: OccupancyStatus = !occupiedLine
    ? 'unknown'
    : /desocupad/i.test(occupiedLine) ? 'vacant' : 'occupied'

  const paymentMethods = [
    ownResourcesLine ? 'Recursos próprios' : null,
    financingStatus === 'allowed' || financingStatus === 'conditional' ? 'Financiamento' : null,
    fgtsStatus === 'allowed' || fgtsStatus === 'conditional' ? 'FGTS' : null,
  ].filter((value): value is string => Boolean(value))

  const risks: DocumentAnalysis['risks'] = []
  if (occupancyStatus === 'occupied') risks.push({ severity: 'high', title: 'Imóvel ocupado', detail: occupiedLine ?? 'A fonte indica ocupação.' })
  if (condominiumLine) risks.push({ severity: 'medium', title: 'Condomínio exige conferência', detail: condominiumLine })
  if (taxLine) risks.push({ severity: 'medium', title: 'Tributos exigem conferência', detail: taxLine })

  return {
    analysis: {
      summary: 'Leitura automática das condições publicadas na fonte oficial. Confirme as regras antes de apresentar proposta ou lance.',
      fgts: { status: fgtsStatus, note: fgtsLine ?? 'A fonte consultada não trouxe uma regra explícita sobre FGTS.' },
      financing: { status: financingStatus, note: financingLine ?? 'A fonte consultada não trouxe uma regra explícita sobre financiamento.' },
      occupancy: { status: occupancyStatus, note: occupiedLine ?? 'A ocupação não foi informada no conteúdo consultado.' },
      condominium_debt: {
        status: condominiumLine ? 'conditional' : 'not_found',
        responsibility: condominiumLine ?? 'Não informada',
        note: condominiumLine ?? 'Não foi encontrada regra explícita sobre condomínio.',
      },
      tax_debt: {
        status: taxLine ? 'conditional' : 'not_found',
        responsibility: taxLine ?? 'Não informada',
        note: taxLine ?? 'Não foi encontrada regra explícita sobre tributos.',
      },
      payment_methods: paymentMethods,
      risks,
      confidence: [fgtsLine, financingLine, condominiumLine, taxLine].filter(Boolean).length >= 3 ? 'high' : 'medium',
    },
    evidence: [
      ...evidence('fgts', fgtsLine),
      ...evidence('financing', financingLine),
      ...evidence('occupancy', occupiedLine),
      ...evidence('condominium_debt', condominiumLine),
      ...evidence('tax_debt', taxLine),
      ...evidence('payment_methods', ownResourcesLine),
    ],
  }
}

const SYSTEM_PROMPT = `Você extrai condições de venda de imóveis bancários brasileiros.
Responda somente JSON válido. Não invente. Quando a fonte não disser algo, use not_found ou unknown.
Não transforme uma regra genérica do menu do site em condição do imóvel.
Evidências e textos devem permanecer curtos e fiéis ao documento.`

function userPrompt(sourceText: string, baseline: DocumentAnalysis): string {
  return `Revise a extração determinística abaixo usando somente a FONTE OFICIAL.
Mantenha este formato exato:
{
  "summary": "string",
  "fgts": {"status":"allowed|not_allowed|conditional|not_found","note":"string"},
  "financing": {"status":"allowed|not_allowed|conditional|not_found","note":"string"},
  "occupancy": {"status":"occupied|vacant|unknown","note":"string"},
  "condominium_debt": {"status":"allowed|not_allowed|conditional|not_found","responsibility":"string","note":"string"},
  "tax_debt": {"status":"allowed|not_allowed|conditional|not_found","responsibility":"string","note":"string"},
  "payment_methods": ["string"],
  "risks": [{"severity":"high|medium|low","title":"string","detail":"string"}],
  "confidence":"high|medium|low"
}

EXTRAÇÃO INICIAL:
${JSON.stringify(baseline)}

FONTE OFICIAL:
${sourceText}`
}

function extractJson(value: string): unknown {
  const stripped = value.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Resposta da IA sem JSON')
  return JSON.parse(match[0])
}

function normalizeAnalysis(value: unknown, fallback: DocumentAnalysis): DocumentAnalysis {
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, any>
  const status = (candidate: unknown, defaultValue: FindingStatus): FindingStatus =>
    findingStatuses.has(candidate as FindingStatus) ? candidate as FindingStatus : defaultValue
  const occupancy = occupancyStatuses.has(raw.occupancy?.status as OccupancyStatus)
    ? raw.occupancy.status as OccupancyStatus
    : fallback.occupancy.status
  const confidence = ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : fallback.confidence

  return {
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 1000) : fallback.summary,
    fgts: {
      status: status(raw.fgts?.status, fallback.fgts.status),
      note: typeof raw.fgts?.note === 'string' ? raw.fgts.note.slice(0, 1000) : fallback.fgts.note,
    },
    financing: {
      status: status(raw.financing?.status, fallback.financing.status),
      note: typeof raw.financing?.note === 'string' ? raw.financing.note.slice(0, 1000) : fallback.financing.note,
    },
    occupancy: {
      status: occupancy,
      note: typeof raw.occupancy?.note === 'string' ? raw.occupancy.note.slice(0, 1000) : fallback.occupancy.note,
    },
    condominium_debt: {
      status: status(raw.condominium_debt?.status, fallback.condominium_debt.status),
      responsibility: typeof raw.condominium_debt?.responsibility === 'string' ? raw.condominium_debt.responsibility.slice(0, 1000) : fallback.condominium_debt.responsibility,
      note: typeof raw.condominium_debt?.note === 'string' ? raw.condominium_debt.note.slice(0, 1000) : fallback.condominium_debt.note,
    },
    tax_debt: {
      status: status(raw.tax_debt?.status, fallback.tax_debt.status),
      responsibility: typeof raw.tax_debt?.responsibility === 'string' ? raw.tax_debt.responsibility.slice(0, 1000) : fallback.tax_debt.responsibility,
      note: typeof raw.tax_debt?.note === 'string' ? raw.tax_debt.note.slice(0, 1000) : fallback.tax_debt.note,
    },
    payment_methods: Array.isArray(raw.payment_methods) ? raw.payment_methods.filter((item: unknown) => typeof item === 'string').slice(0, 8) : fallback.payment_methods,
    risks: Array.isArray(raw.risks) ? raw.risks.filter((risk: unknown) => risk && typeof risk === 'object').slice(0, 8).map((risk: any) => ({
      severity: ['high', 'medium', 'low'].includes(risk.severity) ? risk.severity : 'medium',
      title: String(risk.title ?? 'Ponto de atenção').slice(0, 200),
      detail: String(risk.detail ?? '').slice(0, 1000),
    })) : fallback.risks,
    confidence,
  }
}

async function analyzeWithOpenRouter(sourceText: string, baseline: DocumentAnalysis) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://leila-lemon.vercel.app',
      'X-Title': 'Leila Radar',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 1600,
      temperature: 0,
      response_format: { type: 'json_object' },
      provider: { require_parameters: true, data_collection: 'deny' },
      plugins: [{ id: 'response-healing' }],
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(sourceText, baseline) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`OpenRouter respondeu ${response.status}`)
  const result = await response.json() as any
  const content = result.choices?.[0]?.message?.content
  return {
    analysis: normalizeAnalysis(extractJson(content ?? ''), baseline),
    provider: 'openrouter',
    model: result.model ?? OPENROUTER_MODEL,
    inputTokens: Number(result.usage?.prompt_tokens ?? 0),
    outputTokens: Number(result.usage?.completion_tokens ?? 0),
  }
}

async function analyzeWithAnthropic(sourceText: string, baseline: DocumentAnalysis) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 })
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1600,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt(sourceText, baseline) }],
  })
  const content = response.content.find(block => block.type === 'text')
  if (!content || content.type !== 'text') throw new Error('Anthropic não retornou texto')
  return {
    analysis: normalizeAnalysis(extractJson(content.text), baseline),
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

function tagsFor(analysis: DocumentAnalysis): string[] {
  const tags = new Set<string>()
  if (analysis.fgts.status === 'allowed') tags.add('FGTS permitido')
  if (analysis.fgts.status === 'conditional') tags.add('FGTS condicionado')
  if (analysis.fgts.status === 'not_allowed') tags.add('Sem FGTS')
  if (analysis.financing.status === 'allowed') tags.add('Financiamento permitido')
  if (analysis.financing.status === 'conditional') tags.add('Financiamento condicionado')
  if (analysis.financing.status === 'not_allowed') tags.add('Sem financiamento')
  if (analysis.occupancy.status === 'occupied') tags.add('Ocupado')
  if (analysis.occupancy.status === 'vacant') tags.add('Desocupado')
  if (analysis.condominium_debt.status !== 'not_found') tags.add('Conferir condomínio')
  if (analysis.tax_debt.status !== 'not_found') tags.add('Conferir tributos')
  return [...tags]
}

export async function analyzeOfficialDocument(sourceUrl: string): Promise<DocumentAnalysisResult> {
  const sourceText = await fetchOfficialSnapshot(sourceUrl)
  const documentHash = crypto.createHash('sha256').update(sourceText).digest('hex')
  const deterministic = rulesAnalysis(sourceText)

  if (/não está mais disponível para venda/i.test(sourceText)) {
    return {
      status: 'unavailable', documentHash, provider: 'rules', model: PROMPT_VERSION,
      tags: ['Indisponível na fonte'], analysis: deterministic.analysis,
      evidence: [{ field: 'availability', excerpt: sourceText }], inputTokens: 0, outputTokens: 0,
    }
  }

  let ai = {
    analysis: deterministic.analysis,
    provider: 'rules',
    model: PROMPT_VERSION,
    inputTokens: 0,
    outputTokens: 0,
  }

  try {
    if (process.env.OPENROUTER_API_KEY) {
      ai = await analyzeWithOpenRouter(sourceText, deterministic.analysis)
    } else if (process.env.ANTHROPIC_API_KEY) {
      ai = await analyzeWithAnthropic(sourceText, deterministic.analysis)
    }
  } catch (error) {
    console.error('[document-analysis] AI fallback to rules:', error instanceof Error ? error.message : error)
  }

  return {
    status: 'done', documentHash, provider: ai.provider, model: ai.model,
    tags: tagsFor(ai.analysis), analysis: ai.analysis, evidence: deterministic.evidence,
    inputTokens: ai.inputTokens, outputTokens: ai.outputTokens,
  }
}
