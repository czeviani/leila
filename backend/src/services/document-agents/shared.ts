// Tipos e utilitários compartilhados pelos 3 agentes da leitura documental
// (extrator → jurista de ônus → consolidador). Ver document-analysis.service.ts
// para o orquestrador que os encadeia.
import Anthropic from '@anthropic-ai/sdk'
import { recordUsage } from '../ai-usage.service'

let _client: Anthropic | null = null
export function getAnthropicClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 })
  return _client
}

export type AgentStage = 'extractor' | 'liabilities' | 'consolidator'

export interface AgentUsageContext {
  runId: string
  propertyId: string
  userId?: string | null
  stage: AgentStage
}

/** Grava uma chamada de agente. Nunca lança — custo já foi incorrido mesmo se o registro falhar. */
export async function recordAgentUsage(ctx: AgentUsageContext, model: string, usage: Anthropic.Usage) {
  return recordUsage({
    runId: ctx.runId,
    feature: 'document_analysis',
    stage: ctx.stage,
    propertyId: ctx.propertyId,
    userId: ctx.userId ?? null,
    provider: 'anthropic',
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  })
}

/** Um documento pronto para ser lido pelo Agente A — já baixado, ainda não analisado. */
export interface DocumentInput {
  /** id em leila_property_documents, quando já persistido; senão um id local temporário. */
  id: string
  documentType: 'listing' | 'edital' | 'matricula' | 'laudo' | 'errata' | 'certificate' | 'attachment' | 'unknown'
  sourceUrl: string
  label?: string | null
  /** PDF em base64 — quando presente, tem prioridade sobre plainText. */
  contentBase64?: string
  /** Texto puro (página HTML já convertida) — usado quando não há PDF. */
  plainText?: string
}

export interface PropertyIdentityContext {
  externalId?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
}

/** Um fato extraído de UM documento, com citação verbatim verificada pela própria API (citations). */
export interface ExtractedFact {
  topic: 'IDENTIDADE' | 'FGTS' | 'FINANCIAMENTO' | 'CONDOMINIO' | 'TRIBUTOS' | 'ONUS' | 'OCUPACAO' | 'REGRAS_PAGAMENTO' | 'RISCOS' | 'OUTROS'
  statement: string
  /** Trecho literal, verificado pelo servidor da Anthropic como substring real do documento (citations). */
  verbatimQuote: string
  page: number | null
  sourceDocumentId: string
  sourceDocumentType: DocumentInput['documentType']
  sourceUrl: string
}

export interface DocumentExtraction {
  documentId: string
  documentType: DocumentInput['documentType']
  sourceUrl: string
  readOk: boolean
  errorMessage?: string
  facts: ExtractedFact[]
  /** Quantas frases o modelo escreveu sem conseguir ancorar em citação — descartadas. Sinal de qualidade da fonte, não do modelo. */
  discardedUncitedCount: number
  identityMatch: 'matched' | 'partial' | 'mismatch' | 'not_checked'
}

/** Mesma heurística de leila_document_analyses.identityCheck() original, adaptada para rodar
 * sobre os fatos de IDENTIDADE já extraídos (curtos) em vez do texto bruto completo. */
export function checkIdentity(facts: ExtractedFact[], context?: PropertyIdentityContext): 'matched' | 'partial' | 'mismatch' | 'not_checked' {
  if (!context) return 'not_checked'
  const identityFacts = facts.filter(f => f.topic === 'IDENTIDADE')
  if (identityFacts.length === 0) return 'not_checked'
  const haystack = normalize([...identityFacts.map(f => f.statement), ...identityFacts.map(f => f.verbatimQuote)].join(' \n '))
  const external = normalize(context.externalId)
  const address = normalize(context.address)
  const city = normalize(context.city)

  const externalHit = Boolean(external && haystack.includes(external))
  const addressTokens = address.split(' ').filter(t => t.length >= 4).slice(0, 5)
  const addressHits = addressTokens.filter(t => haystack.includes(t)).length
  const cityHit = Boolean(city && haystack.includes(city))

  if (externalHit || (addressHits >= 2 && cityHit)) return 'matched'
  if (cityHit || addressHits > 0) return 'partial'
  return 'mismatch'
}

// Marcas de acento remanescentes após normalize('NFD') — faixa Unicode 0300-036F,
// escrita via new RegExp(string) para não depender de caracteres combinantes crus no fonte.
const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g')

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD').replace(COMBINING_DIACRITICS, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
