import type { Request, Response } from 'express'
import * as conversationService from '../services/conversation.service.js'
import { handleError } from '../utils/handleError.js'

export async function listConversations(req: Request, res: Response) {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Math.min(Number(req.query.limit ?? 20), 50)
    const result = await conversationService.listForUser(req.user!.id, page, limit)
    return res.json({ ...result, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function startConversation(req: Request, res: Response) {
  try {
    const { participantId, subject, initialMessage } = req.body
    if (!participantId || !initialMessage) {
      return res.status(400).json({ status: 'error', message: 'participantId and initialMessage are required', code: 400 })
    }
    const conversation = await conversationService.create(req.user!.id, participantId, subject, initialMessage)
    return res.status(201).json({ data: conversation, status: 'success', code: 201 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function getConversation(req: Request, res: Response) {
  try {
    const conversation = await conversationService.getById(req.params.id, req.user!.id)
    return res.json({ data: conversation, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const { body, attachmentUrl, attachmentType } = req.body
    if (!body) {
      return res.status(400).json({ status: 'error', message: 'body is required', code: 400 })
    }
    const message = await conversationService.addMessage(req.params.id, req.user!.id, body, attachmentUrl, attachmentType)
    return res.status(201).json({ data: message, status: 'success', code: 201 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function listMessages(req: Request, res: Response) {
  try {
    const page = Number(req.query.page ?? 1)
    const limit = Math.min(Number(req.query.limit ?? 50), 100)
    const result = await conversationService.listMessages(req.params.id, req.user!.id, page, limit)
    return res.json({ ...result, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function markConversationRead(req: Request, res: Response) {
  try {
    await conversationService.markRead(req.params.id, req.user!.id)
    return res.json({ status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}
