import { Router } from 'express'
import { listCategories, getCategory } from '../controllers/categories.js'
import { cacheMiddleware, TTL } from '../middleware/cache.js'

const router = Router()

router.get('/', cacheMiddleware(TTL.HOUR), listCategories)
router.get('/:id', cacheMiddleware(TTL.HOUR), getCategory)

export default router
