import { Router } from 'express'
import { scraperStatus, scrapeSource, scrapeAll } from '../controllers/scraper.controller'
import { getDataHealth, getIngestionRuns } from '../controllers/trust.controller'

const router = Router()
router.get('/status', scraperStatus)
router.get('/health', getDataHealth)
router.get('/runs', getIngestionRuns)
router.post('/run/all', scrapeAll)
router.post('/run/:source_id', scrapeSource)
export default router
