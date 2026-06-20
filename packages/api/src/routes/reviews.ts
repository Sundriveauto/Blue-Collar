import { Router, type Request, type Response } from 'express'
import { db } from '../db.js'
import {
  flagReview,
  getModerationQueue,
  moderateReview,
} from '../controllers/reviews.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router({ mergeParams: true })

export async function listWorkerReviews(req: Request, res: Response) {
  const workerId = req.params.workerId ?? req.params.id
  const [reviews, aggregate] = await Promise.all([
    db.review.findMany({
      where: { workerId },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.review.aggregate({
      where: { workerId },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ])

  return res.json({
    data: reviews,
    avgRating: aggregate._avg.rating ?? 0,
    reviewCount: aggregate._count.rating,
    status: 'success',
    code: 200,
  })
}

export async function createWorkerReview(req: Request, res: Response) {
  const workerId = req.params.workerId ?? req.params.id
  const rating = Number(req.body.rating)
  const body = String(req.body.body ?? req.body.comment ?? '').trim()

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ status: 'error', message: 'rating must be 1-5', code: 400 })
  }

  if (!body) {
    return res.status(400).json({ status: 'error', message: 'body is required', code: 400 })
  }

  const worker = await db.worker.findUnique({ where: { id: workerId } })
  if (!worker) return res.status(404).json({ status: 'error', message: 'Worker not found', code: 404 })

  try {
    const review = await db.review.create({
      data: {
        workerId,
        userId: req.user!.id,
        authorId: req.user!.id,
        rating,
        body,
        comment: body,
      },
    })
    return res.status(201).json({ data: review, status: 'success', code: 201 })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ status: 'error', message: 'You have already reviewed this worker', code: 409 })
    }
    throw err
  }
}

export async function deleteReview(req: Request, res: Response) {
  const review = await db.review.findUnique({ where: { id: req.params.id } })
  if (!review) return res.status(404).json({ status: 'error', message: 'Not found', code: 404 })
  if (review.userId !== req.user!.id) {
    return res.status(403).json({ status: 'error', message: 'Forbidden', code: 403 })
  }

  await db.review.delete({ where: { id: req.params.id } })
  return res.status(204).send()
}

router.get('/', listWorkerReviews)
router.post('/', authenticate, createWorkerReview)
router.delete('/:id', authenticate, deleteReview)
router.patch('/:id/flag', authenticate, flagReview)

// Admin moderation
router.get('/moderation/queue', authenticate, authorize('admin'), getModerationQueue)
router.patch('/:id/moderate', authenticate, authorize('admin'), moderateReview)

export default router
