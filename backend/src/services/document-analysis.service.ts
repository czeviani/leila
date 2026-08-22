// Orquestrador da leitura documental (pipeline v2).
//
// A versão anterior deste arquivo fazia UM fetch na página de anúncio via
// r.jina.ai, cortava 24k caracteres com âncoras específicas da Caixa e mandava
// para um modelo pequeno (qwen 9B) cuja saída era sobrescrita por um regex
// sempre que o regex não achava nada — nunca lia matrícula ou laudo de
// avaliação, e a "diligência" era, na prática, a mesma leitura superficial que
// o usuário faria sozinho.
//
// Este pipeline: (1) descobre todos os documentos oficiais do imóvel via
// scraper (proxy BR necessário para a Caixa), (2) lê cada um com um agente
// dedicado que usa citação verbatim verificada pela própria API como guarda
// anti-alucinação, (3) um segundo agente classifica cada ônus por QUEM PAGA,
// (4) um terceiro consolida resumo, riscos e conflitos entre documentos.
// Ver backend/src/services/document-agents/.
import crypto from 'node:crypto'
import { supabaseAdmin } from '../config/supabase'
import { discoverDocuments, fetchDocument, DiscoveredDocumentType, FetchedDocument } from './document-fetcher.service'
import { extractDocumentFacts } from './document-agents/extractor'
import { judgeLiabilities, Liability, PaymentRules } from './document-agents/liabilities'
import { consolidate, RankedRisk, Conflict } from './document-agents/consolidator'
import { DocumentInput, ExtractedFact, DocumentExtraction, PropertyIdentityContext } from './document-agents/shared'

export const PROMPT_VERSION = 'document-v2'
const MAX_DOCUMENTS = 6

const ALLOWED_LISTING_HOSTS = new Set([
  'venda-imoveis.caixa.gov.br', 'www.caixa.gov.br', 'caixa.gov.br',
  'www.santander.com.br', 'santander.com.br',
  'www.itau.com.br', 'itau.com.br',
  'www.bb.com.br', 'bb.com.br',
  'www.megaleiloes.com.br', 'megaleiloes.com.br',
  'www.zukerman.com.br', 'zukerman.com.br',
  'www.portalzuk.com.br', 'portalzuk.com.br',
  'www.superbid.net', 'superbid.net',
  'www.superbid.com.br', 'superbid.com.br',
])

export interface DocumentAnalysisContext extends PropertyIdentityContext {
  propertyId: string
  sourceId: string
  sourceName: string
  auctionModality: string | null
  userId?: string | null
  /** Mega Leilões publica o edital do certame na página do evento, não na do lote — vem de raw_data.event_url. */
  eventUrl?: string | null
}

export interface DocumentReadSummary {
  url: string
  type: string
  label: string | null
  readOk: boolean
  errorMessage?: string
  factCount: number
  identityMatch: 'matched' | 'partial' | 'mismatch' | 'not_checked'
}

export interface EvidenceItem {
  field: string
  excerpt: string
  source?: string
  confidence?: 'high' | 'medium' | 'low'
}

export interface DocumentAnalysisPipelineResult {
  status: 'done' | 'unavailable'
  promptVersion: string
  runId: string
  documentHash: string
  tags: string[]
  summary: string
  liabilities: Liability[]
  paymentRules: PaymentRules
  totalArrematanteBrl: number
  risks: RankedRisk[]
  conflicts: Conflict[]
  evidence: EvidenceItem[]
  documentsRead: DocumentReadSummary[]
  identityMatch: 'matched' | 'partial' | 'mismatch' | 'not_checked'
  completenessScore: number
  blockingIssues: string[]
  decisionStatus: 'ready_for_final_review' | 'pending_diligence' | 'blocked'
  sourceSnapshot: Record<string, unknown>
}

export type StageCallback = (stage: string, detail: string) => Promise<void>

function safeParseUrl(value: string): URL | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

function compactListingText(markdown: string): string {
  const unavailableMarker = 'O imóvel que você procura não está mais disponível para venda.'
  if (markdown.includes(unavailableMarker)) return unavailableMarker

  const anchors = ['Valor de avaliação:', 'Valor mínimo de venda:', 'Dados do imóvel']
  const start = anchors.map(a => markdown.indexOf(a)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const endCandidates = ['Corretores credenciados', 'Melhor crédito para você', '[Topo]']
    .map(a => markdown.indexOf(a, start + 100))
    .filter(i => i > start)
    .sort((a, b) => a - b)
  const end = endCandidates[0] ?? Math.min(markdown.length, start + 40_000)

  return markdown
    .slice(start, end)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 40_000)
}

/** Fallback universal quando a descoberta de documentos não está disponível: lê a
 * própria página de anúncio via leitor externo (funciona tanto para HTML quanto PDF). */
async function fetchListingSnapshot(sourceUrl: string): Promise<string> {
  const parsed = safeParseUrl(sourceUrl)
  if (!parsed || !ALLOWED_LISTING_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Fonte documental não autorizada')
  }
  const readerUrl = `https://r.jina.ai/${parsed.toString()}`
  const response = await fetch(readerUrl, {
    headers: { Accept: 'text/plain', 'User-Agent': 'LeilaRadar/1.0' },
    signal: AbortSignal.timeout(35_000),
  })
  if (!response.ok) throw new Error(`Fonte documental respondeu ${response.status}`)
  const text = await response.text()
  if (!text.trim()) throw new Error('Fonte documental sem conteúdo legível')
  return compactListingText(text)
}

function priorityOf(type: DiscoveredDocumentType): number {
  const order: DiscoveredDocumentType[] = ['edital', 'matricula', 'laudo', 'errata', 'certificate', 'attachment', 'unknown']
  const index = order.indexOf(type)
  return index === -1 ? order.length : index
}

async function persistDocumentSnapshot(propertyId: string, doc: DocumentInput, fetched: FetchedDocument | null) {
  const content = doc.contentBase64 ?? doc.plainText ?? ''
  const contentHash = crypto.createHash('sha256').update(content).digest('hex')
  const parsedUrl = safeParseUrl(doc.sourceUrl)

  const { error } = await supabaseAdmin.from('leila_property_documents').upsert({
    property_id: propertyId,
    document_type: doc.documentType,
    source_url: doc.sourceUrl,
    source_host: parsedUrl?.hostname ?? null,
    content_hash: contentHash,
    captured_at: new Date().toISOString(),
    content_type: fetched?.content_type ?? (doc.contentBase64 ? 'application/pdf' : 'text/plain'),
    extracted_text: doc.plainText?.slice(0, 200_000) ?? null,
    metadata: fetched ? { bytes: fetched.bytes, sha256: fetched.sha256 } : {},
    is_current: true,
  }, { onConflict: 'property_id,source_url,content_hash' })

  if (error) console.error('[document-analysis] falha ao salvar snapshot do documento:', error.message)
}

interface BuiltDocuments {
  documents: DocumentInput[]
  sourceSnapshot: Record<string, unknown>
  listingTextForAvailabilityCheck: string | null
}

async function buildDocumentInputs(context: DocumentAnalysisContext, fallbackListingUrl: string): Promise<BuiltDocuments> {
  const discovery = await discoverDocuments(context.sourceId, fallbackListingUrl, context.eventUrl)
  const documents: DocumentInput[] = []
  const sourceSnapshot: Record<string, unknown> = { captured_at: new Date().toISOString() }

  if (discovery && discovery.documents.length > 0) {
    const prioritized = [...discovery.documents]
      .sort((a, b) => priorityOf(a.type) - priorityOf(b.type))
      .slice(0, MAX_DOCUMENTS)

    const fetched = await Promise.all(prioritized.map(async doc => ({ doc, result: await fetchDocument(doc.url) })))

    for (const { doc, result } of fetched) {
      if (!result) continue
      const isPdf = result.content_type.toLowerCase().includes('pdf')
      const input: DocumentInput = {
        id: crypto.randomUUID(),
        documentType: doc.type,
        sourceUrl: doc.url,
        label: doc.label,
        contentBase64: isPdf ? result.content_base64 : undefined,
        plainText: isPdf ? undefined : Buffer.from(result.content_base64, 'base64').toString('utf-8'),
      }
      documents.push(input)
      await persistDocumentSnapshot(context.propertyId, input, result)
    }
    sourceSnapshot.discovery_documents_found = discovery.documents.length
    sourceSnapshot.discovery_documents_read = documents.length
  } else {
    sourceSnapshot.discovery_unavailable = true
  }

  if (documents.length === 0) {
    const listingText = discovery?.listing_text ?? await fetchListingSnapshot(fallbackListingUrl)
    const input: DocumentInput = {
      id: crypto.randomUUID(),
      documentType: 'listing',
      sourceUrl: fallbackListingUrl,
      plainText: listingText,
    }
    documents.push(input)
    await persistDocumentSnapshot(context.propertyId, input, null)
    sourceSnapshot.fallback_listing_only = true
    return { documents, sourceSnapshot, listingTextForAvailabilityCheck: listingText }
  }

  const listingDoc = documents.find(d => d.documentType === 'listing')
  return { documents, sourceSnapshot, listingTextForAvailabilityCheck: listingDoc?.plainText ?? discovery?.listing_text ?? null }
}

function overallIdentityMatch(matches: Array<'matched' | 'partial' | 'mismatch' | 'not_checked'>): 'matched' | 'partial' | 'mismatch' | 'not_checked' {
  if (matches.includes('mismatch')) return 'mismatch'
  if (matches.includes('matched')) return 'matched'
  if (matches.includes('partial')) return 'partial'
  return 'not_checked'
}

export async function analyzeOfficialDocumentV2(
  fallbackListingUrl: string,
  context: DocumentAnalysisContext,
  onStage?: StageCallback,
): Promise<DocumentAnalysisPipelineResult> {
  const runId = crypto.randomUUID()

  await onStage?.('discovering', 'Localizando documentos oficiais do imóvel…')
  const { documents, sourceSnapshot, listingTextForAvailabilityCheck } = await buildDocumentInputs(context, fallbackListingUrl)

  if (listingTextForAvailabilityCheck?.includes('não está mais disponível para venda')) {
    return {
      status: 'unavailable',
      promptVersion: PROMPT_VERSION,
      runId,
      documentHash: crypto.createHash('sha256').update(listingTextForAvailabilityCheck).digest('hex'),
      tags: ['Indisponível na fonte'],
      summary: 'A fonte oficial informa que este imóvel não está mais disponível para venda.',
      liabilities: [],
      paymentRules: {
        fgts: { applicable: false, status: 'not_found', note: '', basis_quote: null },
        financiamento: { applicable: false, status: 'not_found', note: '', basis_quote: null },
        consorcio: { applicable: false, status: 'not_found', note: '', basis_quote: null },
      },
      totalArrematanteBrl: 0,
      risks: [],
      conflicts: [],
      evidence: [],
      documentsRead: [],
      identityMatch: 'not_checked',
      completenessScore: 0,
      blockingIssues: ['Imóvel indisponível na fonte'],
      decisionStatus: 'blocked',
      sourceSnapshot,
    }
  }

  await onStage?.('reading', `Lendo ${documents.length} documento(s)…`)
  const identityContext: PropertyIdentityContext = {
    externalId: context.externalId, address: context.address, city: context.city, state: context.state,
  }
  const usageCtxFor = (stage: 'extractor' | 'liabilities' | 'consolidator') => ({
    runId, propertyId: context.propertyId, userId: context.userId, stage,
  })

  const extractions: DocumentExtraction[] = await Promise.all(
    documents.map(doc => extractDocumentFacts(doc, identityContext, usageCtxFor('extractor'))),
  )

  // Backfill de identidade por documento — a coleta em lote já gravou a linha sem essa informação.
  await Promise.all(extractions.map(async e => {
    const { error } = await supabaseAdmin
      .from('leila_property_documents')
      .update({ identity_match: e.identityMatch })
      .eq('property_id', context.propertyId)
      .eq('source_url', e.sourceUrl)
    if (error) console.error('[document-analysis] falha ao atualizar identity_match do documento:', error.message)
  }))

  const facts: ExtractedFact[] = extractions.flatMap(e => e.facts)
  const documentsRead: DocumentReadSummary[] = extractions.map((e, i) => ({
    url: e.sourceUrl,
    type: e.documentType,
    label: documents[i]?.label ?? null,
    readOk: e.readOk,
    errorMessage: e.errorMessage,
    factCount: e.facts.length,
    identityMatch: e.identityMatch,
  }))

  const allFailed = extractions.every(e => !e.readOk)
  if (allFailed || facts.length === 0) {
    return {
      status: 'done',
      promptVersion: PROMPT_VERSION,
      runId,
      documentHash: crypto.createHash('sha256').update(documents.map(d => d.sourceUrl).join('|')).digest('hex'),
      tags: [],
      summary: allFailed
        ? 'Não foi possível ler nenhum dos documentos oficiais deste imóvel.'
        : 'Os documentos foram lidos, mas nenhuma informação relevante e citável foi encontrada.',
      liabilities: [],
      paymentRules: {
        fgts: { applicable: false, status: 'not_found', note: '', basis_quote: null },
        financiamento: { applicable: false, status: 'not_found', note: '', basis_quote: null },
        consorcio: { applicable: false, status: 'not_found', note: '', basis_quote: null },
      },
      totalArrematanteBrl: 0,
      risks: [],
      conflicts: [],
      evidence: [],
      documentsRead,
      identityMatch: 'not_checked',
      completenessScore: 0,
      blockingIssues: allFailed ? ['Nenhum documento pôde ser lido'] : ['Nenhuma informação citável foi extraída dos documentos'],
      decisionStatus: 'blocked',
      sourceSnapshot,
    }
  }

  await onStage?.('classifying', 'Classificando ônus e responsabilidades de pagamento…')
  const liabilitiesResult = await judgeLiabilities(
    facts,
    { modality: context.auctionModality, sourceName: context.sourceName },
    usageCtxFor('liabilities'),
  )

  await onStage?.('consolidating', 'Consolidando o resultado final…')
  const consolidation = await consolidate(facts, liabilitiesResult, extractions, usageCtxFor('consolidator'))

  const evidence: EvidenceItem[] = facts.map(f => ({
    field: f.topic.toLowerCase(),
    excerpt: f.verbatimQuote,
    source: f.sourceUrl,
    confidence: 'high',
  }))

  const documentHash = crypto.createHash('sha256')
    .update(documents.map(d => `${d.sourceUrl}:${d.contentBase64?.length ?? d.plainText?.length ?? 0}`).join('|'))
    .digest('hex')

  return {
    status: 'done',
    promptVersion: PROMPT_VERSION,
    runId,
    documentHash,
    tags: consolidation.tags,
    summary: consolidation.summary,
    liabilities: liabilitiesResult.liabilities,
    paymentRules: liabilitiesResult.payment_rules,
    totalArrematanteBrl: liabilitiesResult.totalArrematanteBrl,
    risks: consolidation.risks,
    conflicts: consolidation.conflicts,
    evidence,
    documentsRead,
    identityMatch: overallIdentityMatch(extractions.map(e => e.identityMatch)),
    completenessScore: consolidation.completeness_score,
    blockingIssues: consolidation.blocking_issues,
    decisionStatus: consolidation.decision_status,
    sourceSnapshot,
  }
}
