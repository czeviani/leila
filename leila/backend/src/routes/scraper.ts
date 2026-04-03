import { Router } from 'express'
import { scraperStatus, scrapeSource, scrapeAll } from '../controllers/scraper.controller'

const router = Router()
router.get('/status', scraperStatus)
router.post('/run/all', scrapeAll)
router.post('/run/:source_id', scrapeSource)
export default router
