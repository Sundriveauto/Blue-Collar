import type { Worker, Prisma } from '@prisma/client'
import type { IRepository } from './base.repository.js'
import { db } from '../db.js'
import { QueryBuilder } from './queryBuilder.js'

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IWorkerRepository extends IRepository<Worker, Prisma.WorkerCreateInput, Prisma.WorkerUpdateInput> {
  findWithRelations(id: string): Promise<(Worker & { category: unknown; curator: unknown }) | null>
  findByCurator(curatorId: string): Promise<Worker[]>
  findByCategory(categoryId: string, opts?: { skip?: number; take?: number }): Promise<Worker[]>
  findActive(opts?: { skip?: number; take?: number }): Promise<Worker[]>
  toggleActive(id: string): Promise<Worker>
  advancedSearch(filters: AdvancedSearchFilters): Promise<AdvancedSearchResult>
}

export interface AdvancedSearchFilters {
  query?: string
  lat?: number
  lng?: number
  radius?: number
  categories?: string[]
  minRating?: number
  maxRating?: number
  dayOfWeek?: number
  startTime?: string
  endTime?: string
  isVerified?: boolean
  sortBy?: 'relevance' | 'rating' | 'distance' | 'newest' | 'reviews'
  skip?: number
  take?: number
}

export interface AdvancedSearchResult {
  data: (Worker & { relevanceScore?: number; distanceKm?: number; avgRating?: number; reviewCount?: number })[]
  total: number
  hasMore: boolean
}

// ── Prisma implementation ─────────────────────────────────────────────────────

const workerInclude = { category: true, curator: true } as const

export class WorkerRepository implements IWorkerRepository {
  async findById(id: string): Promise<Worker | null> {
    return db.worker.findUnique({ where: { id } })
  }

  async findWithRelations(id: string) {
    return db.worker.findUnique({ where: { id }, include: workerInclude })
  }

  async findAll(opts: { skip?: number; take?: number } = {}): Promise<Worker[]> {
    const query = QueryBuilder.pagination(opts)
    return db.worker.findMany({ ...query, orderBy: QueryBuilder.defaultSort() })
  }

  async findActive(opts: { skip?: number; take?: number } = {}): Promise<Worker[]> {
    const query = QueryBuilder.buildQuery({
      pagination: opts,
      filter: { isActive: true },
    })
    return db.worker.findMany({
      ...query,
      include: workerInclude,
    })
  }

  async findByCurator(curatorId: string): Promise<Worker[]> {
    const query = QueryBuilder.buildQuery({
      filter: { curatorId },
    })
    return db.worker.findMany({
      ...query,
      include: workerInclude,
    })
  }

  async findByCategory(categoryId: string, opts: { skip?: number; take?: number } = {}): Promise<Worker[]> {
    const query = QueryBuilder.buildQuery({
      pagination: opts,
      filter: { categoryId, isActive: true },
    })
    return db.worker.findMany({
      ...query,
      include: workerInclude,
    })
  }

  async create(data: Prisma.WorkerCreateInput): Promise<Worker> {
    return db.worker.create({ data, include: workerInclude })
  }

  async update(id: string, data: Prisma.WorkerUpdateInput): Promise<Worker> {
    return db.worker.update({ where: { id }, data, include: workerInclude })
  }

  async delete(id: string): Promise<Worker> {
    return db.worker.delete({ where: { id } })
  }

  async count(where?: Prisma.WorkerWhereInput): Promise<number> {
    return db.worker.count({ where })
  }

  async toggleActive(id: string): Promise<Worker> {
    const worker = await db.worker.findUniqueOrThrow({ where: { id } })
    return db.worker.update({ where: { id }, data: { isActive: !worker.isActive } })
  }

  async advancedSearch(filters: AdvancedSearchFilters): Promise<AdvancedSearchResult> {
    const {
      query,
      lat,
      lng,
      radius = 10,
      categories,
      minRating,
      maxRating,
      dayOfWeek,
      startTime,
      endTime,
      isVerified,
      sortBy = 'relevance',
      skip = 0,
      take = 20,
    } = filters

    // Build base where clause
    const where: Prisma.WorkerWhereInput = {
      isActive: true,
    }

    if (categories && categories.length > 0) {
      where.categoryId = { in: categories }
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified
    }

    // Availability filtering
    if (dayOfWeek !== undefined || startTime || endTime) {
      where.availability = { some: {} }
      const availWhere: any = where.availability.some
      if (dayOfWeek !== undefined) {
        availWhere.dayOfWeek = dayOfWeek
      }
      if (startTime) {
        availWhere.startTime = { gte: startTime }
      }
      if (endTime) {
        availWhere.endTime = { lte: endTime }
      }
    }

    // Fetch workers with all relations
    let workers = await db.worker.findMany({
      where,
      include: {
        category: true,
        curator: true,
        location: true,
        reviews: { select: { rating: true } },
        _count: { select: { reviews: true } },
      },
      skip,
      take: take + 1, // +1 to determine hasMore
    })

    // Apply geo filtering if provided
    if (lat !== undefined && lng !== undefined) {
      workers = workers.filter(w => {
        if (!w.location?.lat || !w.location?.lng) return false
        const dist = this.haversine(lat, lng, w.location.lat, w.location.lng)
        return dist <= radius
      })
    }

    // Apply rating filtering and calculate avg rating
    if (minRating !== undefined || maxRating !== undefined) {
      workers = workers.filter(w => {
        if (w.reviews.length === 0) return false
        const avg = w.reviews.reduce((sum, r) => sum + r.rating, 0) / w.reviews.length
        return (!minRating || avg >= minRating) && (!maxRating || avg <= maxRating)
      })
    }

    // Map to include computed fields
    const enriched = workers.map(w => {
      const avgRating = w.reviews.length > 0
        ? w.reviews.reduce((sum, r) => sum + r.rating, 0) / w.reviews.length
        : 0
      const distanceKm = lat && lng && w.location?.lat && w.location?.lng
        ? this.haversine(lat, lng, w.location.lat, w.location.lng)
        : undefined
      return {
        ...w,
        avgRating,
        distanceKm,
        reviewCount: w._count.reviews,
        relevanceScore: this.calculateRelevance(w, query, avgRating, distanceKm),
      }
    })

    // Sort
    enriched.sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return b.avgRating - a.avgRating
        case 'distance':
          if (a.distanceKm === undefined) return 1
          if (b.distanceKm === undefined) return -1
          return a.distanceKm - b.distanceKm
        case 'reviews':
          return b.reviewCount - a.reviewCount
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'relevance':
        default:
          return (b.relevanceScore || 0) - (a.relevanceScore || 0)
      }
    })

    const hasMore = enriched.length > take
    const data = enriched.slice(0, take)
    const total = await db.worker.count({ where })

    return { data, total, hasMore }
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  private calculateRelevance(
    worker: any,
    query?: string,
    avgRating?: number,
    distanceKm?: number,
  ): number {
    let score = 0

    // Name/bio relevance
    if (query) {
      const q = query.toLowerCase()
      const nameMatch = (worker.name?.toLowerCase() ?? '').includes(q)
      const bioMatch = (worker.bio?.toLowerCase() ?? '').includes(q)
      if (nameMatch) score += 50
      if (bioMatch) score += 25
    }

    // Rating relevance (up to 50 points)
    if (avgRating !== undefined) {
      score += (avgRating / 5) * 50
    }

    // Proximity relevance (up to 30 points, closer is better)
    if (distanceKm !== undefined) {
      score += Math.max(0, 30 - distanceKm)
    }

    // Verification bonus
    if (worker.isVerified) {
      score += 20
    }

    return score
  }
}

export const workerRepository = new WorkerRepository()
