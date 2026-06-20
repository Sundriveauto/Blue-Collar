import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { processTip, createEscrow, getFee, updateFee } from '../controllers/payment.js'

const router = Router()

router.get('/fee', getFee)
router.patch('/fee', authenticate, authorize('admin'), updateFee)
router.post('/tip', authenticate, processTip)
router.post('/escrow', authenticate, createEscrow)

export default router
