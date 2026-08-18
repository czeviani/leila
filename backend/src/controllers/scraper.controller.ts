import { Request, Response } from 'express'
import { triggerScrape, triggerScrapeAll, getScraperStatus } from '../services/scraper.service'

export const scraperStatus = async (_req: Request, res: Response) => {
  try {
    const status = await getScraperStatus()
    return res.json(status)
  } catch {
    // Scraper local indisponível — retorna status básico
    return res.json({
      service: 'leila-scraper',
      available_sources: {},
      proxy_count: 0,
      mode: 'unavailable',
      error: 'Scraper local indisponível. A rodada automática continua sendo responsabilidade do workflow agendado.',
    })
  }
}

export const scrapeSource = async (req: Request, res: Response) => {
  const { source_id } = req.params
  try {
    const result = await triggerScrape(source_id)
    return res.json(result)
  } catch (error) {
    return res.status(503).json({ error: `Scraper local indisponível: ${String(error)}` })
  }
}

export const scrapeAll = async (_req: Request, res: Response) => {
  try {
    const results = await triggerScrapeAll()
    return res.json(results)
  } catch (error) {
    return res.status(503).json({ error: `Scraper local indisponível: ${String(error)}` })
  }
}
