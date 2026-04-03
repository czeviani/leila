import { Router } from 'express'
import { getEvaluation, requestEvaluation } from '../controllers/evaluations.controller'

const router = Router()
router.get('/:property_id', getEvaluation)
router.post('/', requestEvaluation)
export default router
