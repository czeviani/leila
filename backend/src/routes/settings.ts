import { Router } from 'express'
import { getSettings, upsertSettings, upsertWorkLocation } from '../controllers/settings.controller'
import { getAiUsageSummary } from '../controllers/ai-usage.controller'

const router = Router()
router.get('/', getSettings)
router.put('/', upsertSettings)
router.put('/work-location', upsertWorkLocation)
router.get('/ai-usage/summary', getAiUsageSummary)
export default router
