import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'
process.env.DATABASE_URL = 'postgresql://localhost:5432/test'

vi.mock('../routes/auth.js', () => ({ default: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('../routes/categories.js', () => ({ default: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('../routes/workers.js', () => ({ default: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('../routes/portfolio.js', () => ({ default: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('../routes/reviews.js', () => ({ default: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('../routes/subscriptions.js', () => ({ default: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('../services/reminder.service.js', () => ({ startReminderScheduler: vi.fn() }))
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn() } }))
vi.mock('../config/passport.js', () => ({ default: { initialize: () => (_req: Request, _res: Response, next: NextFunction) => next() } }))

describe('security headers', () => {
  it('sets key Helmet headers on GET /', async () => {
    const { default: app } = await import('../index.js')
    const res = await request(app).get('/')

    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000')
    expect(res.headers['content-security-policy']).toContain("default-src 'self'")
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
