import { Router } from 'express'
import {
  listConversations,
  startConversation,
  getConversation,
  sendMessage,
  listMessages,
  markConversationRead,
} from '../controllers/conversations.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.use(authenticate)

router.get('/', listConversations)
router.post('/', startConversation)
router.get('/:id', getConversation)
router.get('/:id/messages', listMessages)
router.post('/:id/messages', sendMessage)
router.patch('/:id/read', markConversationRead)

export default router
