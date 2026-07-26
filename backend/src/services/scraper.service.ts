const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8000'
const SCRAPER_SECRET = process.env.SCRAPER_SECRET || ''

const scraperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Scraper-Secret': SCRAPER_SECRET,
})

export interface ScrapeResult {
  total: number
  inserted: number
  updated: number
  errors: number
}

export const triggerScrape = async (sourceId: string): Promise<ScrapeResult> => {
  const response = await fetch(`${SCRAPER_URL}/scrape/${sourceId}`, {
    method: 'POST',
    headers: scraperHeaders(),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Scraper error for source ${sourceId}: ${err}`)
  }

  return response.json() as Promise<ScrapeResult>
}

export const triggerScrapeAll = async (): Promise<Record<string, ScrapeResult>> => {
  const response = await fetch(`${SCRAPER_URL}/scrape/all`, {
    method: 'POST',
    headers: scraperHeaders(),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Scraper error: ${err}`)
  }

  return response.json() as Promise<Record<string, ScrapeResult>>
}

export const getScraperStatus = async () => {
  const response = await fetch(`${SCRAPER_URL}/status`, { headers: scraperHeaders() })
  if (!response.ok) throw new Error('Scraper unavailable')
  return response.json()
}
