import { Router } from 'express'
import { getSources, updateSource } from '../controllers/sources.controller'

const router = Router()
router.get('/', getSources)
router.patch('/:id', updateSource)
export default router
