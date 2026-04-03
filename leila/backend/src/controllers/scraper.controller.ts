import { Request, Response } from 'express'
import { triggerScrape, triggerScrapeAll, getScraperStatus } from '../services/scraper.service'

export const scraperStatus = async (_req: Request, res: Response) => {
  try {
    const status = await getScraperStatus()
    return res.json(status)
  } catch {
    return res.status(503).json({ error: 'Scraper service unavailable' })
  }
}

export const scrapeSource = async (req: Request, res: Response) => {
  const { source_id } = req.params
  try {
    const result = await triggerScrape(source_id)
    return res.json(result)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}

export const scrapeAll = async (_req: Request, res: Response) => {
  try {
    const results = await triggerScrapeAll()
    return res.json(results)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
