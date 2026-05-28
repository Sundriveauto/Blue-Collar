import { Router } from 'express'
import { listWorkers, listUsers, getStats, bulkToggleWorkers, bulkDeleteWorkers } from '../controllers/admin.js'
import { importWorkersFromCsvController } from '../controllers/csv-import.js'
import { authenticate, authorize } from '../middleware/auth.js'
import multer from 'multer'

const router = Router()
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.use(authenticate, authorize('admin'))

router.get('/stats', getStats)
router.get('/workers', listWorkers)
router.get('/users', listUsers)
router.post('/workers/import', csvUpload.single('file'), importWorkersFromCsvController)
router.post('/workers/bulk-toggle', bulkToggleWorkers)
router.delete('/workers/bulk-delete', bulkDeleteWorkers)

export default router
