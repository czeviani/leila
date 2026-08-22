import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  compareProperties,
  getNeighborhoodProfiles,
  getOpportunityPresets,
  getProperties,
  getPropertyCities,
  getPropertyById,
} from '../controllers/properties.controller'
import { getDocumentAnalysis, requestDocumentAnalysis } from '../controllers/document-analysis.controller'
import { getPropertyAiUsage } from '../controllers/ai-usage.controller'
import {
  discardProperty,
  getDiscardedProperties,
  restoreDiscardedProperty,
} from '../controllers/discarded.controller'

const router = Router()
const documentAnalysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas leituras solicitadas — tente novamente em 1 minuto' },
})

router.get('/', getProperties)
router.get('/cities', getPropertyCities)
router.get('/neighborhoods', getNeighborhoodProfiles)
router.get('/presets', getOpportunityPresets)
router.post('/compare', compareProperties)
router.get('/discarded', getDiscardedProperties)
router.get('/:id/document-analysis', getDocumentAnalysis)
router.post('/:id/document-analysis', documentAnalysisLimiter, requestDocumentAnalysis)
router.get('/:id/ai-usage', getPropertyAiUsage)
router.post('/:id/discard', discardProperty)
router.delete('/:id/discard', restoreDiscardedProperty)
router.get('/:id', getPropertyById)
export default router
