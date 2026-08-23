// Agente A — Extrator documental.
//
// Lê UM documento por chamada. No caminho Anthropic, usa PDF nativo + citação
// verificada pela própria API (`citations: {enabled: true}`) — isso substitui
// a mordaça anterior (document-analysis.service.ts sobrescrevendo a IA com um
// regex quando o regex não achava nada): em vez de validar a saída da IA com
// heurística própria, usamos a garantia do servidor da Anthropic de que todo
// `cited_text` é um trecho literal do documento. Frase sem citação anexada é
// descartada — é o próprio guard-rail anti-alucinação do pipeline.
//
// No caminho OpenRouter/OpenAI (Chat Completions, sem PDF nativo nem citação
// server-side), o mesmo guard-rail é reimplementado em software: extrai texto
// do PDF localmente (extractPdfText) quando não há plainText, pede a citação
// como campo JSON, e descarta qualquer uma que não seja um trecho literal do
// texto-fonte (verifyQuoteInText) — ver shared.ts.
import Anthropic from '@anthropic-ai/sdk'
import {
  getAnthropicClient, recordAgentUsage, recordAgentUsageFailure, resolveAgentModel, extractPdfText, verifyQuoteInText,
  AgentUsageContext, DocumentInput, PropertyIdentityContext, ExtractedFact, DocumentExtraction, LlmConfig, checkIdentity,
} from './shared'
import { getOpenRouterClient, getOpenAiClient } from '../evaluator.service'

const ANTHROPIC_MODEL = process.env.DOCUMENT_EXTRACTOR_MODEL || 'claude-sonnet-5'

const TOPICS = ['IDENTIDADE', 'FGTS', 'FINANCIAMENTO', 'CONDOMINIO', 'TRIBUTOS', 'ONUS', 'OCUPACAO', 'REGRAS_PAGAMENTO', 'RISCOS', 'OUTROS'] as const
type Topic = ExtractedFact['topic']

const SYSTEM_PROMPT = `Você é um extrator forense de documentos de leilão imobiliário brasileiro (editais, matrículas de cartório, laudos de avaliação, páginas oficiais de anúncio).

Sua única tarefa é ler o documento fornecido e relatar, sob os seguintes títulos EXATOS (nesta ordem, todos presentes, em maiúsculas, precedidos de "### "):

### IDENTIDADE
Número do imóvel/lote/matrícula, endereço, cartório de registro — qualquer coisa que prove que este documento é sobre o imóvel correto.

### FGTS
Se o FGTS é aceito, não aceito ou aceito com condições para pagamento.

### FINANCIAMENTO
Se financiamento bancário é aceito, não aceito ou aceito com condições.

### CONDOMINIO
Débitos de condomínio existentes, valor se houver, e quem é responsável por pagá-los (arrematante, vendedor, ou sub-rogado no valor do lance).

### TRIBUTOS
IPTU e outros tributos em aberto, valor se houver, e quem é responsável por pagá-los.

### ONUS
Qualquer ônus real ou gravame: hipoteca, penhora, alienação fiduciária, usufruto, ação judicial em curso, indisponibilidade. Inclua credor e valor quando informados.

### OCUPACAO
Se o imóvel está ocupado ou desocupado, e por quem.

### REGRAS_PAGAMENTO
Comissão do leiloeiro (%), forma de pagamento (à vista, parcelado, sinal), prazo para pagamento, ITBI, custos de registro em cartório — e sempre que o documento disser explicitamente quem paga cada um.

### RISCOS
Cláusulas de risco para o comprador: venda "ad corpus", impossibilidade de reclamar por vício oculto, multas por desistência, bloqueio de participação em leilões futuros, prazo de desistência.

### OUTROS
Qualquer outro fato financeiro ou jurídico relevante que não se encaixe acima.

REGRAS OBRIGATÓRIAS:
1. Cada frase deve ser CURTA (uma informação por frase) e vir imediatamente de uma citação ou paráfrase direta do texto-fonte. Nunca combine duas informações diferentes numa frase.
2. Se o documento não trouxer nada sobre um título, escreva exatamente uma linha: "Nada encontrado." e siga para o próximo título. Nunca deixe um título sem essa linha ou sem conteúdo.
3. NUNCA use conhecimento geral sobre leilões brasileiros para preencher lacunas. Se não está escrito no documento, é "Nada encontrado." — mesmo que pareça óbvio ou usual no mercado.
4. NUNCA misture informação de um documento anterior ou de outro imóvel. Use apenas o que está neste documento.
5. Valores em R$ devem ser citados exatamente como aparecem no documento, sem arredondar ou converter.
6. Escreva em português, direto, sem floreio.`

// Variante para o caminho sem citação nativa: pede a citação como campo JSON
// explícito em vez de confiar no recurso `citations` da Messages API.
const JSON_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

FORMATO DE SAÍDA: em vez dos títulos "###", devolva APENAS um JSON com este formato:
{"facts": [{"topic": "UM_DOS_TITULOS_ACIMA", "statement": "frase curta", "verbatim_quote": "trecho literal do documento que sustenta a frase, copiado exatamente, sem parafrasear"}]}
Não inclua entradas para títulos sem nada encontrado. "verbatim_quote" tem que ser uma cópia EXATA de um trecho do documento — se você não conseguir copiar um trecho literal, não inclua o fato.`

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['facts'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'statement', 'verbatim_quote'],
        properties: {
          topic: { type: 'string', enum: TOPICS as unknown as string[] },
          statement: { type: 'string' },
          verbatim_quote: { type: 'string' },
        },
      },
    },
  },
} as const

function buildDocumentBlock(doc: DocumentInput): Anthropic.DocumentBlockParam {
  const source: Anthropic.DocumentBlockParam['source'] = doc.contentBase64
    ? { type: 'base64', media_type: 'application/pdf', data: doc.contentBase64 }
    : { type: 'text', media_type: 'text/plain', data: doc.plainText ?? '' }
  return {
    type: 'document',
    source,
    citations: { enabled: true },
    title: doc.label ?? doc.sourceUrl,
  }
}

function normalizeTopic(raw: string): Topic {
  const clean = raw.trim().toUpperCase() as Topic
  return (TOPICS as readonly string[]).includes(clean) ? clean : 'OUTROS'
}

function isNadaEncontrado(text: string): boolean {
  return /^nada encontrado\.?$/i.test(text.trim())
}

/** Extrai o(s) título(s) "### TOPICO" de um bloco de texto e o texto restante sem os marcadores. */
function stripHeadings(text: string): { headings: Topic[]; body: string } {
  const headings: Topic[] = []
  const cleaned = text.replace(/#{2,3}\s*([A-ZÀ-Ú_]+)\s*\n?/g, (_match, name: string) => {
    headings.push(normalizeTopic(name))
    return ''
  })
  return { headings, body: cleaned.trim() }
}

function describeDocument(doc: DocumentInput, identityContext?: PropertyIdentityContext): string {
  return identityContext
    ? `Documento a analisar: ${doc.documentType} (${doc.sourceUrl}).\nImóvel esperado — ID: ${identityContext.externalId ?? 'não informado'}, endereço: ${identityContext.address ?? 'não informado'}, cidade: ${identityContext.city ?? 'não informada'}.`
    : `Documento a analisar: ${doc.documentType} (${doc.sourceUrl}).`
}

async function extractViaAnthropic(
  doc: DocumentInput,
  identityContext: PropertyIdentityContext | undefined,
  model: string,
): Promise<{ facts: ExtractedFact[]; discardedUncitedCount: number; usage: Anthropic.Usage }> {
  const client = getAnthropicClient()
  let currentTopic: Topic = 'OUTROS'
  const facts: ExtractedFact[] = []
  let discardedUncitedCount = 0

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [buildDocumentBlock(doc), { type: 'text', text: describeDocument(doc, identityContext) }],
    }],
  })

  for (const block of response.content) {
    if (block.type !== 'text') continue
    const { headings, body } = stripHeadings(block.text)
    if (headings.length > 0) currentTopic = headings[headings.length - 1]
    if (!body || isNadaEncontrado(body)) continue

    const citations = block.citations ?? []
    if (citations.length === 0) {
      discardedUncitedCount += 1
      continue
    }
    for (const citation of citations) {
      const citedText = 'cited_text' in citation ? citation.cited_text : null
      if (!citedText) continue
      facts.push({
        topic: currentTopic,
        statement: body,
        verbatimQuote: citedText,
        page: 'start_page_number' in citation ? citation.start_page_number : null,
        sourceDocumentId: doc.id,
        sourceDocumentType: doc.documentType,
        sourceUrl: doc.sourceUrl,
      })
    }
  }

  return { facts, discardedUncitedCount, usage: response.usage }
}

async function extractViaChatCompletions(
  doc: DocumentInput,
  identityContext: PropertyIdentityContext | undefined,
  config: LlmConfig,
  model: string,
): Promise<{ facts: ExtractedFact[]; discardedUncitedCount: number; usage: { promptTokens: number; completionTokens: number; cost?: number } }> {
  const client = config.provider === 'openrouter' ? getOpenRouterClient() : getOpenAiClient()

  const sourceText = doc.plainText ?? (doc.contentBase64 ? await extractPdfText(doc.contentBase64) : null)
  if (!sourceText) throw new Error('Não foi possível extrair texto do documento para leitura fora da Anthropic')

  const res = await client.chat.completions.create({
    model,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${JSON_SYSTEM_PROMPT}\n\nSchema esperado: ${JSON.stringify(JSON_SCHEMA)}` },
      { role: 'user', content: `${describeDocument(doc, identityContext)}\n\nTEXTO DO DOCUMENTO:\n${sourceText.slice(0, 180_000)}` },
    ],
  })

  const usage = res.usage as (typeof res.usage & { cost?: number }) | undefined
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as { facts?: Array<{ topic: string; statement: string; verbatim_quote: string }> }

  const facts: ExtractedFact[] = []
  let discardedUncitedCount = 0
  for (const fact of parsed.facts ?? []) {
    if (!verifyQuoteInText(fact.verbatim_quote, sourceText)) {
      discardedUncitedCount += 1
      continue
    }
    facts.push({
      topic: normalizeTopic(fact.topic),
      statement: fact.statement,
      verbatimQuote: fact.verbatim_quote,
      page: null,
      sourceDocumentId: doc.id,
      sourceDocumentType: doc.documentType,
      sourceUrl: doc.sourceUrl,
    })
  }

  return {
    facts, discardedUncitedCount,
    usage: { promptTokens: usage?.prompt_tokens ?? 0, completionTokens: usage?.completion_tokens ?? 0, cost: usage?.cost },
  }
}

export async function extractDocumentFacts(
  doc: DocumentInput,
  identityContext: PropertyIdentityContext | undefined,
  config: LlmConfig,
  usageCtx: AgentUsageContext,
): Promise<DocumentExtraction> {
  const model = resolveAgentModel(config, ANTHROPIC_MODEL)

  try {
    if (config.provider === 'anthropic') {
      const { facts, discardedUncitedCount, usage } = await extractViaAnthropic(doc, identityContext, model)
      await recordAgentUsage(usageCtx, {
        provider: 'anthropic', model,
        inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0, cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      })
      return {
        documentId: doc.id, documentType: doc.documentType, sourceUrl: doc.sourceUrl, readOk: true,
        facts, discardedUncitedCount, identityMatch: checkIdentity(facts, identityContext),
      }
    }

    const { facts, discardedUncitedCount, usage } = await extractViaChatCompletions(doc, identityContext, config, model)
    await recordAgentUsage(usageCtx, {
      provider: config.provider, model,
      inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, costUsdOverride: usage.cost,
    })
    return {
      documentId: doc.id, documentType: doc.documentType, sourceUrl: doc.sourceUrl, readOk: true,
      facts, discardedUncitedCount, identityMatch: checkIdentity(facts, identityContext),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida ao ler o documento'
    console.error(`[document-agents:extractor] falha em ${doc.sourceUrl}:`, message)
    await recordAgentUsageFailure(usageCtx, config, message)
    return {
      documentId: doc.id,
      documentType: doc.documentType,
      sourceUrl: doc.sourceUrl,
      readOk: false,
      errorMessage: message,
      facts: [],
      discardedUncitedCount: 0,
      identityMatch: 'not_checked',
    }
  }
}
