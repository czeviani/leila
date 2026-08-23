// Cliente dos endpoints de documentos do scraper Python (POST /documents/discover,
// POST /documents/fetch). Segue o mesmo padrão de scraper.service.ts.
//
// O scraper é quem busca porque é o único componente com proxy BR rotativo e
// impersonation de browser — necessário para furar o WAF da Caixa. O Node só
// orquestra e analisa. Se o scraper ainda não tiver os endpoints novos (rollout
// em estágios) ou estiver fora do ar, as duas funções devolvem null/[] em vez
// de lançar — o orquestrador cai no fallback de ler só a página de anúncio,
// que é o comportamento anterior ao pipeline v2.
const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8000'
const SCRAPER_SECRET = process.env.SCRAPER_SECRET || ''

const scraperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Scraper-Secret': SCRAPER_SECRET,
})

export type DiscoveredDocumentType = 'edital' | 'matricula' | 'laudo' | 'errata' | 'certificate' | 'attachment' | 'unknown'

export interface DiscoveredDocument {
  url: string
  type: DiscoveredDocumentType
  label?: string | null
  content_type?: string | null
}

export interface DiscoverResult {
  documents: DiscoveredDocument[]
  listing_text: string | null
}

export async function discoverDocuments(sourceId: string, listingUrl: string, eventUrl?: string | null): Promise<DiscoverResult | null> {
  try {
    const response = await fetch(`${SCRAPER_URL}/documents/discover`, {
      method: 'POST',
      headers: scraperHeaders(),
      body: JSON.stringify({ source_id: sourceId, listing_url: listingUrl, event_url: eventUrl ?? null }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!response.ok) {
      console.warn(`[document-fetcher] /documents/discover respondeu ${response.status} para ${listingUrl}`)
      return null
    }
    return await response.json() as DiscoverResult
  } catch (error) {
    console.warn('[document-fetcher] /documents/discover indisponível:', error instanceof Error ? error.message : error)
    return null
  }
}

export interface FetchedDocument {
  content_base64: string
  content_type: string
  bytes: number
  sha256: string
  /** 'reader' = veio via leitor externo (r.jina.ai) porque o host bloqueou o fetch direto —
   * para PDFs isso significa content_base64 é texto extraído, não o PDF binário original. */
  via?: 'direct' | 'reader'
}

export async function fetchDocument(url: string): Promise<FetchedDocument | null> {
  try {
    const response = await fetch(`${SCRAPER_URL}/documents/fetch`, {
      method: 'POST',
      headers: scraperHeaders(),
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
      console.warn(`[document-fetcher] /documents/fetch respondeu ${response.status} para ${url}`)
      return null
    }
    return await response.json() as FetchedDocument
  } catch (error) {
    console.warn(`[document-fetcher] /documents/fetch de ${url} falhou:`, error instanceof Error ? error.message : error)
    return null
  }
}
