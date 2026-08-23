// Tipos e utilitários compartilhados pelos 3 agentes da leitura documental
// (extrator → jurista de ônus → consolidador). Ver document-analysis.service.ts
// para o orquestrador que os encadeia.
//
// Os 3 agentes agora respeitam o provider/modelo salvo em Configurações (leila_settings),
// em vez de falar Anthropic direto — antes disto, trocar de provider na tela só afetava
// o Avaliador de investimento, e a leitura documental continuava 100% presa à Anthropic
// mesmo com o usuário sem crédito lá e um provider alternativo configurado e pago.
import Anthropic from '@anthropic-ai/sdk'
import { PDFParse } from 'pdf-parse'
import { recordUsage } from '../ai-usage.service'
import { getOpenRouterClient, getOpenAiClient, LlmConfig, LlmProvider } from '../evaluator.service'

export type { LlmConfig, LlmProvider }

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

export interface AgentUsage {
  provider: LlmProvider
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** Quando o provider já devolve custo pronto (ex.: OpenRouter usage.cost em USD). */
  costUsdOverride?: number
}

/** Grava uma chamada de agente. Nunca lança — custo já foi incorrido mesmo se o registro falhar. */
export async function recordAgentUsage(ctx: AgentUsageContext, usage: AgentUsage) {
  return recordUsage({
    runId: ctx.runId,
    feature: 'document_analysis',
    stage: ctx.stage,
    propertyId: ctx.propertyId,
    userId: ctx.userId ?? null,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    costUsdOverride: usage.costUsdOverride,
  })
}

export async function recordAgentUsageFailure(ctx: AgentUsageContext, config: LlmConfig, message: string) {
  await recordUsage({
    runId: ctx.runId, feature: 'document_analysis', stage: ctx.stage,
    propertyId: ctx.propertyId, userId: ctx.userId ?? null,
    provider: config.provider, model: config.model, inputTokens: 0, outputTokens: 0,
    success: false, errorMessage: message,
  })
}

/** Modelo default por estágio, usado só quando o provider é 'anthropic' e o
 * usuário não tem override por env var — os outros providers sempre usam o
 * modelo escolhido em Configurações (config.model), porque não faz sentido
 * ter um "melhor modelo" fixo quando o usuário já disse qual quer usar. */
export function resolveAgentModel(config: LlmConfig, anthropicDefault: string): string {
  return config.provider === 'anthropic' ? (config.model || anthropicDefault) : config.model
}

/** Chamada de agente com saída JSON estruturada, usada pelo jurista de ônus e
 * pelo consolidador — nenhum dos dois precisa de PDF nativo nem de citações
 * verificadas pelo servidor (o extrator já fez isso), só de um schema fixo.
 * Anthropic usa json_schema nativo (mais confiável); OpenRouter/OpenAI usam
 * response_format json_object com o schema descrito no prompt, já que nem
 * todo modelo do catálogo do OpenRouter suporta json_schema estrito. */
export async function callJsonAgent<T>(
  config: LlmConfig,
  params: { system: string; user: string; schema: Record<string, unknown>; maxTokens: number; anthropicModel: string },
): Promise<{ data: T; usage: AgentUsage }> {
  const model = resolveAgentModel(config, params.anthropicModel)

  if (config.provider === 'anthropic') {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model,
      max_tokens: params.maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: params.schema } },
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
    })
    const block = response.content.find(b => b.type === 'text')
    if (!block || block.type !== 'text') throw new Error('Resposta do agente sem texto')
    return {
      data: JSON.parse(block.text) as T,
      usage: {
        provider: 'anthropic', model,
        inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    }
  }

  const client = config.provider === 'openrouter' ? getOpenRouterClient() : getOpenAiClient()
  const schemaHint = `\n\nResponda APENAS com um JSON válido, sem texto fora do JSON, seguindo exatamente este schema:\n${JSON.stringify(params.schema)}`
  const res = await client.chat.completions.create({
    model,
    max_tokens: params.maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: params.system + schemaHint },
      { role: 'user', content: params.user },
    ],
  })
  const usage = res.usage as (typeof res.usage & { cost?: number }) | undefined
  const text = res.choices[0]?.message?.content ?? '{}'
  return {
    data: JSON.parse(text) as T,
    usage: {
      provider: config.provider, model: res.model ?? model,
      inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0,
      costUsdOverride: usage?.cost,
    },
  }
}

/** Extrai texto de um PDF localmente — só usado no caminho não-Anthropic do
 * extrator, porque OpenRouter/OpenAI (API de Chat Completions) não têm
 * parser de PDF nativo como a Messages API da Anthropic. Devolve null em
 * PDF de imagem/sem camada de texto (ex.: certidão digitalizada) — mesmo
 * caso hoje coberto por isUnreadableText para o caminho via r.jina.ai. */
export async function extractPdfText(base64: string): Promise<string | null> {
  try {
    const parser = new PDFParse({ data: Buffer.from(base64, 'base64') })
    const result = await parser.getText()
    await parser.destroy()
    return result.text?.trim() || null
  } catch (error) {
    console.warn('[document-agents] falha ao extrair texto do PDF localmente:', error instanceof Error ? error.message : error)
    return null
  }
}

/** Normaliza espaços/acentuação leve para comparação de substring — a mesma
 * citação pode ter quebras de linha diferentes entre o que o modelo devolve
 * e o texto-fonte sem mudar de conteúdo. */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/** Guarda anti-alucinação do caminho não-Anthropic: sem citação verificada
 * pelo servidor (recurso nativo só da Messages API), verificamos aqui mesmo
 * que a citação que o modelo devolveu é um trecho literal do texto-fonte —
 * mesmo papel que `citations: {enabled: true}` cumpre no caminho Anthropic. */
export function verifyQuoteInText(quote: string, sourceText: string): boolean {
  if (!quote || quote.trim().length < 6) return false
  return normalizeForMatch(sourceText).includes(normalizeForMatch(quote))
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
  /** Setado quando plainText existe mas não é texto de verdade (ex.: PDF com
   * fonte protegida virando glifos aleatórios via leitor externo) — orquestrador
   * pula a chamada de IA para este documento em vez de arriscar alucinação. */
  unreadableReason?: string
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

/** Heurística barata para detectar texto ilegível — ex.: PDF com fonte cmap
 * protegida (certidões digitais da Caixa) que, extraído via leitor externo em
 * vez do parser nativo da Messages API, vira glifos aleatórios em vez de
 * caracteres reais. Evita gastar uma chamada de IA (e arriscar alucinação)
 * num documento que não tem texto de verdade para ler. */
export function isUnreadableText(text: string): boolean {
  const sample = text.slice(0, 5000)
  if (sample.trim().length < 50) return true
  const readableChars = sample.match(/[a-zA-ZÀ-ÿ0-9\s.,;:()\-/R$%]/g)?.length ?? 0
  return readableChars / sample.length < 0.7
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
