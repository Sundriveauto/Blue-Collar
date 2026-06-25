import { db } from '../db.js'
import { AppError } from './AppError.js'

export async function create(userId: string, participantId: string, subject?: string, initialMessage?: string) {
  const participant = await db.user.findUnique({ where: { id: participantId } })
  if (!participant) throw new AppError('Participant not found', 404)

  return db.conversation.create({
    data: {
      subject,
      participants: {
        createMany: {
          data: [
            { userId, joinedAt: new Date() },
            { userId: participantId, joinedAt: new Date() },
          ],
        },
      },
      messages: initialMessage
        ? { create: { senderId: userId, body: initialMessage } }
        : undefined,
    },
    include: {
      participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
      messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
    },
  })
}

export async function listForUser(userId: string, page: number, limit: number) {
  const where = { participants: { some: { userId } } }
  const [data, total] = await Promise.all([
    db.conversation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
        messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
      },
    }),
    db.conversation.count({ where }),
  ])

  const conversationsWithUnread = await Promise.all(
    data.map(async (conv) => {
      const myParticipation = conv.participants.find(p => p.userId === userId)
      const unreadCount = myParticipation?.lastReadAt
        ? await db.message.count({
            where: {
              conversationId: conv.id,
              senderId: { not: userId },
              createdAt: { gt: myParticipation.lastReadAt },
            },
          })
        : await db.message.count({
            where: { conversationId: conv.id, senderId: { not: userId } },
          })
      return { ...conv, unreadCount }
    })
  )

  return { data: conversationsWithUnread, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

export async function getById(id: string, userId: string) {
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
    },
  })
  if (!conversation) throw new AppError('Conversation not found', 404)
  if (!conversation.participants.some(p => p.userId === userId)) {
    throw new AppError('Forbidden', 403)
  }
  return conversation
}

export async function addMessage(conversationId: string, senderId: string, body: string, attachmentUrl?: string, attachmentType?: string) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { where: { userId: senderId } } },
  })
  if (!conversation) throw new AppError('Conversation not found', 404)
  if (conversation.participants.length === 0) throw new AppError('You are not a participant', 403)

  const [message] = await db.$transaction([
    db.message.create({
      data: { conversationId, senderId, body, attachmentUrl, attachmentType },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    }),
    db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ])

  return message
}

export async function listMessages(conversationId: string, userId: string, page: number, limit: number) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { where: { userId } } },
  })
  if (!conversation) throw new AppError('Conversation not found', 404)
  if (conversation.participants.length === 0) throw new AppError('Forbidden', 403)

  const where = { conversationId }
  const [data, total] = await Promise.all([
    db.message.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    }),
    db.message.count({ where }),
  ])

  return { data: data.reverse(), meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

export async function markRead(conversationId: string, userId: string) {
  const participant = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  if (!participant) throw new AppError('Not a participant', 403)

  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  })

  await db.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  })
}
