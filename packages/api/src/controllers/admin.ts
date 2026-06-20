import type { Request, Response } from 'express'
import { paginate } from '../utils/paginate.js'
import { db } from '../db.js'
import { restoreWorker } from '../services/worker.service.js'

export async function listWorkers(req: Request, res: Response) {
  const { page = '1', limit = '20' } = req.query
  const { data, meta } = await paginate({
    model: 'worker',
    where: { deletedAt: null },
    include: { category: true, curator: true },
    page: Number(page),
    limit: Number(limit),
  })
  return res.json({ data, meta, status: 'success', code: 200 })
}

export async function listUsers(req: Request, res: Response) {
  const { page = '1', limit = '20' } = req.query
  const { data, meta } = await paginate({
    model: 'user',
    where: { deletedAt: null },
    page: Number(page),
    limit: Number(limit),
  })
  return res.json({ data, meta, status: 'success', code: 200 })
}

export async function restoreWorkerHandler(req: Request, res: Response) {
  const worker = await restoreWorker(req.params.id)
  return res.json({ data: worker, status: 'success', code: 200 })
}

export async function getStats(req: Request, res: Response) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [
    totalWorkers,
    activeWorkers,
    totalUsers,
    totalCurators,
    workersThisMonth,
    usersThisMonth,
    topCategories,
    recentWorkers,
    recentUsers,
  ] = await Promise.all([
    db.worker.count(),
    db.worker.count({ where: { isActive: true } }),
    db.user.count(),
    db.user.count({ where: { role: 'curator' } }),
    db.worker.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.category.findMany({
      select: { id: true, name: true, _count: { select: { workers: true } } },
      orderBy: { workers: { _count: 'desc' } },
      take: 5,
    }),
    db.worker.findMany({
      select: { id: true, name: true, createdAt: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.user.findMany({
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, role: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  return res.json({
    data: {
      totalWorkers,
      activeWorkers,
      totalUsers,
      totalCurators,
      workersThisMonth,
      usersThisMonth,
      topCategories: topCategories.map((cat) => ({
        name: cat.name,
        count: cat._count.workers,
      })),
      recentWorkers,
      recentUsers,
    },
    status: 'success',
    code: 200,
  })
}

/**
 * POST /api/admin/workers/bulk-toggle
 * Activate or deactivate multiple workers in a single transaction.
 *
 * Body: { ids: string[], active: boolean }
 */
export async function bulkToggleWorkers(req: Request, res: Response) {
  const { ids, active } = req.body as { ids?: unknown; active?: unknown }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ status: 'error', message: 'ids must be a non-empty array', code: 400 })
  }
  if (typeof active !== 'boolean') {
    return res.status(400).json({ status: 'error', message: 'active must be a boolean', code: 400 })
  }

  const result = await db.$transaction(async (tx) => {
    await tx.worker.updateMany({ where: { id: { in: ids as string[] } }, data: { isActive: active } })
    return tx.worker.count({ where: { id: { in: ids as string[] } } })
  })

  return res.json({ data: { updated: result, active }, status: 'success', code: 200 })
}

/**
 * DELETE /api/admin/workers/bulk-delete
 * Delete multiple workers in a single transaction.
 *
 * Body: { ids: string[] }
 */
export async function bulkDeleteWorkers(req: Request, res: Response) {
  const { ids } = req.body as { ids?: unknown }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ status: 'error', message: 'ids must be a non-empty array', code: 400 })
  }

  const result = await db.$transaction(async (tx) => {
    const { count } = await tx.worker.deleteMany({ where: { id: { in: ids as string[] } } })
    return count
  })

  return res.json({ data: { deleted: result }, status: 'success', code: 200 })
}
