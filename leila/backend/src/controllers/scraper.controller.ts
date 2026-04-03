import { Request, Response } from 'express'
import { triggerScrape, triggerScrapeAll, getScraperStatus } from '../services/scraper.service'

const GH_REPO = 'czeviani/leila'
const GH_WORKFLOW = 'scraper.yml'

export const scraperStatus = async (_req: Request, res: Response) => {
  try {
    const status = await getScraperStatus()
    return res.json(status)
  } catch {
    // Scraper local indisponível — retorna status básico
    return res.json({
      service: 'leila-scraper',
      available_sources: ['caixa'],
      proxy_count: 0,
      mode: 'github-actions',
    })
  }
}

export const scrapeSource = async (req: Request, res: Response) => {
  const { source_id } = req.params
  // Tenta scraper local primeiro; se falhar, dispara GitHub Actions
  try {
    const result = await triggerScrape(source_id)
    return res.json(result)
  } catch {
    return triggerGitHubScraper(res)
  }
}

export const scrapeAll = async (_req: Request, res: Response) => {
  // Tenta scraper local primeiro; se falhar, dispara GitHub Actions
  try {
    const results = await triggerScrapeAll()
    return res.json(results)
  } catch {
    return triggerGitHubScraper(res)
  }
}

async function triggerGitHubScraper(res: Response) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'Scraper indisponível e GITHUB_TOKEN não configurado.' })
  }
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'master' }),
      }
    )
    if (resp.status === 204) {
      return res.json({ queued: true, mode: 'github-actions', message: 'Scraper agendado via GitHub Actions. Os dados serão atualizados em alguns minutos.' })
    }
    const err = await resp.text()
    return res.status(500).json({ error: `GitHub Actions error: ${err}` })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
