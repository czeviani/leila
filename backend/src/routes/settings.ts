import { Router } from 'express'
import { getSettings, upsertSettings } from '../controllers/settings.controller'

const router = Router()
router.get('/', getSettings)
router.put('/', upsertSettings)
export default router
