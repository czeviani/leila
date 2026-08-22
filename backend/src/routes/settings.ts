import { Router } from 'express'
import { getSettings, upsertSettings } from '../controllers/settings.controller'
import { getAiUsageSummary } from '../controllers/ai-usage.controller'

const router = Router()
router.get('/', getSettings)
router.put('/', upsertSettings)
router.get('/ai-usage/summary', getAiUsageSummary)
export default router
