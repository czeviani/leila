import { Router } from 'express'
import { getProperties, getPropertyById } from '../controllers/properties.controller'

const router = Router()
router.get('/', getProperties)
router.get('/:id', getPropertyById)
export default router
