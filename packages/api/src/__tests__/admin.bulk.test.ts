/**
 * Integration tests for admin bulk-action endpoints.
 * POST /api/admin/workers/bulk-toggle
 * DELETE /api/admin/workers/bulk-delete
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bulkToggleWorkers, bulkDeleteWorkers } from '../../controllers/admin.js'

process.env.JWT_SECRET = 'test-secret'
process.env.APP_URL = 'http://localhost:3001'

vi.mock('../../db.js', () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      return fn({
        worker: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          count: vi.fn().mockResolvedValue(2),
        },
      })
    }),
  },
}))

function mockRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

function mockReq(body: object): any {
  return { body, user: { id: 'admin-1', role: 'admin' } }
}

describe('bulkToggleWorkers', () => {
  it('returns 400 when ids is missing', async () => {
    const res = mockRes()
    await bulkToggleWorkers(mockReq({ active: true }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })

  it('returns 400 when ids is empty array', async () => {
    const res = mockRes()
    await bulkToggleWorkers(mockReq({ ids: [], active: true }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when active is not boolean', async () => {
    const res = mockRes()
    await bulkToggleWorkers(mockReq({ ids: ['id1'], active: 'yes' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('activates workers and returns count', async () => {
    const res = mockRes()
    await bulkToggleWorkers(mockReq({ ids: ['id1', 'id2'], active: true }), res)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', data: { updated: 2, active: true } })
    )
  })

  it('deactivates workers and returns count', async () => {
    const res = mockRes()
    await bulkToggleWorkers(mockReq({ ids: ['id1', 'id2'], active: false }), res)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', data: { updated: 2, active: false } })
    )
  })
})

describe('bulkDeleteWorkers', () => {
  it('returns 400 when ids is missing', async () => {
    const res = mockRes()
    await bulkDeleteWorkers(mockReq({}), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })

  it('returns 400 when ids is empty array', async () => {
    const res = mockRes()
    await bulkDeleteWorkers(mockReq({ ids: [] }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('deletes workers and returns count', async () => {
    const res = mockRes()
    await bulkDeleteWorkers(mockReq({ ids: ['id1', 'id2'] }), res)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', data: { deleted: 2 } })
    )
  })
})
