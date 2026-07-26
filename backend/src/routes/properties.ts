import { Router } from 'express'
import { getProperties, getPropertyCities, getPropertyById } from '../controllers/properties.controller'

const router = Router()
router.get('/', getProperties)
router.get('/cities', getPropertyCities)
router.get('/:id', getPropertyById)
export default router
