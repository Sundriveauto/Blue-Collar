import { Router } from 'express'
import {
  getCuratorDashboard,
  getPlatformDashboard,
  getTopWorkers,
  exportCuratorCsv,
  exportPlatformCsv,
} from '../controllers/analytics.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { cacheMiddleware, TTL } from '../middleware/cache.js'

const router = Router()

router.use(authenticate)

// Curator analytics
router.get('/curator', authorize('curator', 'admin'), cacheMiddleware(TTL.SHORT), getCuratorDashboard)
router.get('/export/curator', authorize('curator', 'admin'), exportCuratorCsv)

// Admin platform analytics
router.get('/platform', authorize('admin'), cacheMiddleware(TTL.SHORT), getPlatformDashboard)
router.get('/export/platform', authorize('admin'), exportPlatformCsv)

// Leaderboard (authenticated users)
router.get('/top-workers', cacheMiddleware(TTL.SHORT), getTopWorkers)

export default router
