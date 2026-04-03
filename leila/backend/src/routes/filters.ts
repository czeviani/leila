import { Router } from 'express'
import { getFilters, upsertFilters } from '../controllers/filters.controller'

const router = Router()
router.get('/', getFilters)
router.put('/', upsertFilters)
export default router
