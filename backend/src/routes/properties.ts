import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getProperties, getPropertyCities, getPropertyById } from '../controllers/properties.controller'
import { getDocumentAnalysis, requestDocumentAnalysis } from '../controllers/document-analysis.controller'

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
router.get('/:id/document-analysis', getDocumentAnalysis)
router.post('/:id/document-analysis', documentAnalysisLimiter, requestDocumentAnalysis)
router.get('/:id', getPropertyById)
export default router
