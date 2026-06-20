import { Router } from 'express'
import { listWorkers, listUsers, getStats, bulkToggleWorkers, bulkDeleteWorkers } from '../controllers/admin.js'
import { importWorkersFromCsvController } from '../controllers/csv-import.js'
import { exportWorkers, exportUsers } from '../controllers/export.js'
import { authenticate, authorize } from '../middleware/auth.js'
import multer from 'multer'
import rateLimit from 'express-rate-limit'

const router = Router()
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// 1 export per minute per admin
const exportRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ status: 'error', message: 'Too many export requests. Try again in 1 minute.', code: 429 })
  },
})

router.use(authenticate, authorize('admin'))

router.get('/stats', getStats)
router.get('/workers', listWorkers)
router.get('/users', listUsers)
router.get('/export/workers', exportRateLimit, exportWorkers)
router.get('/export/users', exportRateLimit, exportUsers)
router.post('/workers/import', csvUpload.single('file'), importWorkersFromCsvController)
router.post('/workers/bulk-toggle', bulkToggleWorkers)
router.delete('/workers/bulk-delete', bulkDeleteWorkers)

export default router
