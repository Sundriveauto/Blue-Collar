import type { Request, Response } from 'express'
import * as workerService from '../services/worker.service.js'
import { handleError } from '../utils/handleError.js'
import { db } from '../db.js'
import { WorkerResource, WorkerCollection } from '../resources/index.js'
import { workerSerializer } from '../serializers/index.js'
import type { CreateWorkerBody, UpdateWorkerBody, WorkerQuery } from '../interfaces/index.js'
import { invalidateCachePattern } from '../middleware/cache.js'
import { processImage, deleteImages } from '../utils/imageProcessor.js'

// Haversine distance in km between two lat/lng points
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function listWorkers(req: Request, res: Response) {
  const {
    category, page, cursor, limit = '20', lat, lng, radius,
    search, lang, city, state, country,
    minRating, maxRating, available, listedSince,
    categories, sortBy, sortOrder, isVerified,
  } = req.query
  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100)

  if (!page && !lat && !lng) {
    const categoryIds = categories
      ? String(categories).split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    const categoryFilter = categoryIds && categoryIds.length > 0
      ? { categoryId: { in: categoryIds } }
      : category
      ? { categoryId: String(category) }
      : {}
    const where: any = {
      isActive: true,
      ...categoryFilter,
      ...(isVerified !== undefined ? { isVerified: isVerified === 'true' } : {}),
      ...(city || state || country
        ? {
            location: {
              ...(city ? { city: { contains: String(city), mode: 'insensitive' as const } } : {}),
              ...(state ? { state: { contains: String(state), mode: 'insensitive' as const } } : {}),
              ...(country ? { country: { contains: String(country), mode: 'insensitive' as const } } : {}),
            },
          }
        : {}),
      ...(available !== undefined ? { availability: { some: { dayOfWeek: Number(available) } } } : {}),
      ...(listedSince
        ? { createdAt: { gte: new Date(Date.now() - Number(listedSince) * 365 * 24 * 60 * 60 * 1000) } }
        : {}),
      ...(search ? { name: { contains: String(search), mode: 'insensitive' as const } } : {}),
    }

    if (minRating !== undefined || maxRating !== undefined) {
      const havingClause: any = {}
      if (minRating !== undefined) havingClause.gte = Number(minRating)
      if (maxRating !== undefined) havingClause.lte = Number(maxRating)
      const qualifiedIds = await db.review.groupBy({
        by: ['workerId'],
        _avg: { rating: true },
        having: { rating: { _avg: havingClause } },
      })
      where.id = { in: qualifiedIds.map((r: { workerId: string }) => r.workerId) }
    }

    const rows = await db.worker.findMany({
      where,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
      take: limitNum + 1,
      include: { category: true, curator: true },
      orderBy: { createdAt: 'desc' },
    })
    const data = rows.slice(0, limitNum)

    return res.json({
      data: WorkerCollection(data as any),
      nextCursor: rows.length > limitNum ? data[data.length - 1]?.id ?? null : null,
      limit: limitNum,
      status: 'success',
      code: 200,
    })
  }

  // Geo search: if lat/lng/radius provided, filter by proximity using Haversine
  if (lat && lng) {
    const userLat = Number(lat)
    const userLng = Number(lng)
    const radiusKm = radius ? Number(radius) : 10

    if (isNaN(userLat) || isNaN(userLng) || isNaN(radiusKm))
      return res.status(400).json({ status: 'error', message: 'Invalid lat, lng, or radius', code: 400 })

    // Bounding box pre-filter (1 degree ≈ 111 km)
    const delta = radiusKm / 111
    const workers = await db.worker.findMany({
      where: {
        isActive: true,
        location: {
          lat: { gte: userLat - delta, lte: userLat + delta },
          lng: { gte: userLng - delta, lte: userLng + delta },
        },
        ...(category ? { categoryId: String(category) } : {}),
      },
      include: { category: true, location: true },
    })

    const withDistance = workers
      .filter(w => w.location?.lat != null && w.location?.lng != null)
      .map(w => ({ ...w, distanceKm: haversine(userLat, userLng, w.location!.lat!, w.location!.lng!) }))
      .filter(w => w.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)

    const pageNum = Number(page)
    const paginated = withDistance.slice((pageNum - 1) * limitNum, pageNum * limitNum)
    return res.json({ data: paginated, status: 'success', code: 200 })
  }

  // Parse multi-category: ?categories=id1,id2,id3
  const categoryIds = categories
    ? String(categories).split(',').map(s => s.trim()).filter(Boolean)
    : undefined

  const result = await workerService.listWorkers({
    category: category ? String(category) : undefined,
    categories: categoryIds,
    page: Number(page ?? 1),
    limit: limitNum,
    search: search ? String(search) : undefined,
    lang: lang ? String(lang) : undefined,
    city: city ? String(city) : undefined,
    state: state ? String(state) : undefined,
    country: country ? String(country) : undefined,
    minRating: minRating ? Number(minRating) : undefined,
    maxRating: maxRating ? Number(maxRating) : undefined,
    available: available !== undefined ? Number(available) : undefined,
    listedSince: listedSince ? Number(listedSince) : undefined,
    sortBy: sortBy as any,
    sortOrder: sortOrder as any,
    isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
  })

  return res.json({ ...result, status: 'success', code: 200 })
}

/**
 * GET /api/workers/:id
 * Get a single worker by id.
 *
 * @param req - Route param `id`.
 * @param res - JSON `{ data: Worker, status, code }` or 404.
 */
export async function showWorker(req: Request, res: Response) {
  const worker = await db.worker.findUnique({
    where: { id: req.params.id },
    include: { category: true, portfolio: { orderBy: { order: 'asc' } } },
  })
  if (!worker) return res.status(404).json({ status: 'error', message: 'Not found', code: 404 })
  return res.json({ data: worker, status: 'success', code: 200 })
}

/**
 * POST /api/workers
 * Create a new worker listing. Requires `curator` role.
 *
 * @param req - Body: `CreateWorkerBody`. `req.user` must be set by auth middleware.
 * @param res - JSON `{ data: Worker, status, code: 201 }`.
 */
export async function createWorker(req: Request<{}, {}, CreateWorkerBody>, res: Response) {
  try {
    let imageFields: Record<string, string> = {}
    if (req.file) {
      const imgs = await processImage(req.file.path)
      imageFields = { imageThumb: imgs.thumb, imageMedium: imgs.medium, imageFull: imgs.full, avatar: imgs.full }
    }
    const worker = await workerService.createWorker({ ...req.body, ...imageFields }, req.user!.id)
    await invalidateCachePattern(`cache:*workers?*`)
    return res.status(201).json({
      data: workerSerializer.serialize(worker as any),
      status: 'success',
      code: 201
    })
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * PUT /api/workers/:id
 * Update an existing worker listing. Requires `curator` role.
 *
 * Supports both JSON and multipart/form-data requests:
 * - JSON: Standard PUT with Content-Type: application/json
 * - Multipart: POST with X-HTTP-Method: PUT header (method-override pattern)
 *
 * The method-override middleware (configured in src/index.ts) checks for the
 * X-HTTP-Method header and rewrites req.method accordingly. This allows HTML forms
 * and browsers to send file uploads with PUT semantics, since HTML forms only
 * support GET and POST methods.
 *
 * Example multipart request:
 *   POST /api/workers/:id
 *   X-HTTP-Method: PUT
 *   Content-Type: multipart/form-data
 *   Authorization: Bearer <token>
 *
 * @param req - Route param `id`. Body: `UpdateWorkerBody` (JSON or multipart).
 * @param res - JSON `{ data: Worker, status, code }`.
 */
export async function updateWorker(req: Request<{ id: string }, {}, UpdateWorkerBody>, res: Response) {
  try {
    let imageFields: Record<string, string> = {}
    if (req.file) {
      // Delete old images before writing new ones
      const existing = await db.worker.findUnique({ where: { id: req.params.id }, select: { imageFull: true } })
      if (existing?.imageFull) deleteImages(existing.imageFull)

      const imgs = await processImage(req.file.path)
      imageFields = { imageThumb: imgs.thumb, imageMedium: imgs.medium, imageFull: imgs.full, avatar: imgs.full }
    }
    const worker = await workerService.updateWorker(req.params.id, { ...req.body, ...imageFields })
    await invalidateCachePattern(`cache:*workers/${req.params.id}*`)
    await invalidateCachePattern(`cache:*workers?*`)
    return res.json({
      data: workerSerializer.serialize(worker as any),
      status: 'success',
      code: 200
    })
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * DELETE /api/workers/:id
 * Delete a worker listing. Requires `curator` role.
 *
 * @param req - Route param `id`.
 * @param res - 204 No Content on success.
 */
export async function deleteWorker(req: Request, res: Response) {
  try {
    const existing = await db.worker.findUnique({ where: { id: req.params.id as string }, select: { imageFull: true } })
    if (existing?.imageFull) deleteImages(existing.imageFull)
    await workerService.deleteWorker(req.params.id as string)
    await invalidateCachePattern(`cache:*workers/${req.params.id}*`)
    await invalidateCachePattern(`cache:*workers?*`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * PATCH /api/workers/:id/toggle
 * Toggle a worker's `isActive` status. Requires `curator` role.
 *
 * @param req - Route param `id`.
 * @param res - JSON `{ data: Worker, status, code }`.
 */
export async function toggleActivation(req: Request, res: Response) {
  try {
    const updated = await workerService.toggleWorker(req.params.id as string)
    await invalidateCachePattern(`cache:*workers/${req.params.id}*`)
    await invalidateCachePattern(`cache:*workers?*`)
    return res.json({
      data: workerSerializer.serialize(updated as any),
      status: 'success',
      code: 200
    })
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * GET /api/workers/mine
 * List workers created by the authenticated curator.
 *
 * @param req - Query params: `page`, `limit`. `req.user` must be set by auth middleware.
 * @param res - JSON `{ data: Worker[], meta, status, code }`.
 */
export async function listMyWorkers(req: Request, res: Response) {
  const { page = '1', limit = '20' } = req.query
  const curatorId = req.user!.id
  const where = { curatorId }
  const [workers, total] = await Promise.all([
    db.worker.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.worker.count({ where }),
  ])
  return res.json({
    data: workers,
    meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    status: 'success',
    code: 200,
  })
}
