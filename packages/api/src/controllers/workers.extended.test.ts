/**
 * Extended worker controller tests — edge cases, error handling,
 * listWorkers, showWorker, createWorker, listMyWorkers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/worker.service.js', () => ({
  listWorkers: vi.fn(),
  getWorker: vi.fn(),
  createWorker: vi.fn(),
  updateWorker: vi.fn(),
  deleteWorker: vi.fn(),
  toggleWorker: vi.fn(),
}))

vi.mock('../db.js', () => ({
  db: {
    worker: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('../resources/index.js', () => ({
  WorkerResource: vi.fn((w) => w),
  WorkerCollection: vi.fn((w) => w),
}))

import * as workerService from '../services/worker.service.js'
import { db } from '../db.js'
import {
  listWorkers,
  showWorker,
  createWorker,
  updateWorker,
  deleteWorker,
  toggleActivation,
  listMyWorkers,
} from './workers.js'

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  return res
}

const worker = { id: 'w1', name: 'Alice', isActive: true, curatorId: 'c1' }

beforeEach(() => vi.clearAllMocks())

// ── listWorkers ───────────────────────────────────────────────────────────────

describe('listWorkers', () => {
  it('returns 200 with worker collection and meta', async () => {
    ;(workerService.listWorkers as any).mockResolvedValue({ data: [worker], meta: { total: 1 } })
    const req = { query: {} } as any
    const res = makeRes()
    await listWorkers(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', code: 200 }))
  })

  it('passes query filters to service', async () => {
    ;(workerService.listWorkers as any).mockResolvedValue({ data: [], meta: {} })
    const req = { query: { category: 'plumber', page: '2', limit: '5', search: 'ali' } } as any
    const res = makeRes()
    await listWorkers(req, res)
    expect(workerService.listWorkers).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'plumber', page: 2, limit: 5, search: 'ali' })
    )
  })

  it('handles service errors', async () => {
    ;(workerService.listWorkers as any).mockRejectedValue(new Error('DB down'))
    const res = makeRes()
    await listWorkers({ query: {} } as any, res)
    expect(res.status).toHaveBeenCalled()
  })
})

// ── showWorker ────────────────────────────────────────────────────────────────

describe('showWorker', () => {
  it('returns 200 when worker exists', async () => {
    ;(workerService.getWorker as any).mockResolvedValue(worker)
    const req = { params: { id: 'w1' } } as any
    const res = makeRes()
    await showWorker(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }))
  })

  it('returns 404 when worker does not exist', async () => {
    ;(workerService.getWorker as any).mockResolvedValue(null)
    const req = { params: { id: 'missing' } } as any
    const res = makeRes()
    await showWorker(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Worker not found' }))
  })

  it('handles service errors', async () => {
    ;(workerService.getWorker as any).mockRejectedValue(new Error('DB error'))
    const res = makeRes()
    await showWorker({ params: { id: 'w1' } } as any, res)
    expect(res.status).toHaveBeenCalled()
  })
})

// ── createWorker ──────────────────────────────────────────────────────────────

describe('createWorker', () => {
  it('returns 201 on success', async () => {
    ;(workerService.createWorker as any).mockResolvedValue(worker)
    const req = { body: { name: 'Alice' }, user: { id: 'c1' } } as any
    const res = makeRes()
    await createWorker(req, res)
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('passes curatorId from req.user to service', async () => {
    ;(workerService.createWorker as any).mockResolvedValue(worker)
    const req = { body: { name: 'Alice' }, user: { id: 'curator-99' } } as any
    const res = makeRes()
    await createWorker(req, res)
    expect(workerService.createWorker).toHaveBeenCalledWith(expect.anything(), 'curator-99')
  })

  it('handles service errors', async () => {
    ;(workerService.createWorker as any).mockRejectedValue(new Error('Conflict'))
    const req = { body: {}, user: { id: 'c1' } } as any
    const res = makeRes()
    await createWorker(req, res)
    expect(res.status).toHaveBeenCalled()
  })
})

// ── updateWorker ──────────────────────────────────────────────────────────────

describe('updateWorker (service-level)', () => {
  it('returns 200 on success', async () => {
    ;(workerService.updateWorker as any).mockResolvedValue({ ...worker, name: 'Bob' })
    const req = { params: { id: 'w1' }, body: { name: 'Bob' }, user: { id: 'c1', role: 'curator' } } as any
    const res = makeRes()
    await updateWorker(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }))
  })

  it('handles service errors', async () => {
    ;(workerService.updateWorker as any).mockRejectedValue(new Error('Not found'))
    const req = { params: { id: 'w1' }, body: {}, user: { id: 'c1', role: 'curator' } } as any
    const res = makeRes()
    await updateWorker(req, res)
    expect(res.status).toHaveBeenCalled()
  })
})

// ── deleteWorker ──────────────────────────────────────────────────────────────

describe('deleteWorker (service-level)', () => {
  it('returns 204 on success', async () => {
    ;(workerService.deleteWorker as any).mockResolvedValue(undefined)
    const req = { params: { id: 'w1' }, user: { id: 'c1', role: 'curator' } } as any
    const res = makeRes()
    await deleteWorker(req, res)
    expect(res.status).toHaveBeenCalledWith(204)
  })

  it('handles service errors', async () => {
    ;(workerService.deleteWorker as any).mockRejectedValue(new Error('Not found'))
    const req = { params: { id: 'w1' }, user: { id: 'c1', role: 'curator' } } as any
    const res = makeRes()
    await deleteWorker(req, res)
    expect(res.status).toHaveBeenCalled()
  })
})

// ── toggleActivation ──────────────────────────────────────────────────────────

describe('toggleActivation', () => {
  it('returns 200 with updated worker', async () => {
    ;(workerService.toggleWorker as any).mockResolvedValue({ ...worker, isActive: false })
    const req = { params: { id: 'w1' } } as any
    const res = makeRes()
    await toggleActivation(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }))
  })

  it('handles service errors', async () => {
    ;(workerService.toggleWorker as any).mockRejectedValue(new Error('Not found'))
    const req = { params: { id: 'w1' } } as any
    const res = makeRes()
    await toggleActivation(req, res)
    expect(res.status).toHaveBeenCalled()
  })
})

// ── listMyWorkers ─────────────────────────────────────────────────────────────

describe('listMyWorkers', () => {
  it('returns paginated workers for the authenticated curator', async () => {
    ;(db.worker.findMany as any).mockResolvedValue([worker])
    ;(db.worker.count as any).mockResolvedValue(1)
    const req = { query: { page: '1', limit: '10' }, user: { id: 'c1' } } as any
    const res = makeRes()
    await listMyWorkers(req, res)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', meta: expect.objectContaining({ total: 1 }) })
    )
  })

  it('uses default page/limit when not provided', async () => {
    ;(db.worker.findMany as any).mockResolvedValue([])
    ;(db.worker.count as any).mockResolvedValue(0)
    const req = { query: {}, user: { id: 'c1' } } as any
    const res = makeRes()
    await listMyWorkers(req, res)
    expect(db.worker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    )
  })
})
