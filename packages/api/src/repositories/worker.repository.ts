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
}

export const workerRepository = new WorkerRepository()
