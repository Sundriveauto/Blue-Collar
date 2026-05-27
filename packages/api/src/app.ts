import express from 'express'
import cors from 'cors'
import methodOverride from 'method-override'
import passport from './config/passport.js'
import { redis, cacheMetrics } from './config/redis.js'
import { db } from './db.js'
import { requestLogger } from './middleware/requestLogger.js'
import { registerEventHandlers } from './events/index.js'
import authRoutes from './routes/auth.js'
import categoryRoutes from './routes/categories.js'
import workerRoutes from './routes/workers.js'
import adminRoutes from './routes/admin.js'
import userRoutes from './routes/users.js'
import disputeRoutes from './routes/disputes.js'
import recommendationRoutes from './routes/recommendations.js'
import webhookRoutes from './routes/webhooks.js'
import verificationRoutes from './routes/verifications.js'
import auditRoutes from './routes/audit.js'
import responseTimeRoutes from './routes/response-time.js'
import insuranceRoutes from './routes/insurance.js'
import referralRoutes from './routes/referral.js'
import paymentRoutes from './routes/payments.js'
import { auditMiddleware } from './middleware/audit.js'
import { versionMiddleware, deprecationWarning } from './middleware/version.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version: API_VERSION } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
)

const app = express()

// Register application event handlers
registerEventHandlers()

// Connect Redis (non-blocking — app starts even if Redis is down)
redis.connect().catch(() => {})

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)
app.use(methodOverride('X-HTTP-Method'))
app.use(passport.initialize())
app.use(versionMiddleware)

app.use(auditMiddleware)

// ── Versioned routes (v1) ─────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/categories', categoryRoutes)
app.use('/api/v1/workers', workerRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/disputes', disputeRoutes)
app.use('/api/v1/recommendations', recommendationRoutes)
app.use('/api/v1/webhooks', webhookRoutes)
app.use('/api/v1/verifications', verificationRoutes)
app.use('/api/v1/audit', auditRoutes)
app.use('/api/v1', responseTimeRoutes)
app.use('/api/v1/workers', insuranceRoutes)
app.use('/api/v1/referrals', referralRoutes)
app.use('/api/v1/payments', paymentRoutes)

// ── Version endpoint ──────────────────────────────────────────────────────────
app.get('/api/v1/version', (_req, res) => {
  res.json({
    version: API_VERSION,
    apiVersion: 'v1',
    status: 'current',
    supported: ['v1'],
    deprecated: [],
    sunset: null,
  })
})

// ── Redirect unversioned /api/* → /api/v1/* with deprecation headers ──────────
app.use('/api', deprecationWarning, (req, res) => {
  const target = `/api/v1${req.path}${req.search ?? (Object.keys(req.query).length ? '?' + new URLSearchParams(req.query as any).toString() : '')}`
  res.redirect(301, target)
})

app.get('/health', async (_req, res) => {
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }> = {}

  // Database check
  const dbStart = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart }
  } catch (err: any) {
    checks.database = { status: 'error', latencyMs: Date.now() - dbStart, error: err?.message }
  }

  // Redis check
  const redisStart = Date.now()
  try {
    await redis.ping()
    checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart }
  } catch (err: any) {
    checks.redis = { status: 'error', latencyMs: Date.now() - redisStart, error: err?.message }
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok')
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    service: 'bluecollar-api',
    checks,
    timestamp: new Date().toISOString(),
  })
})

app.get('/metrics/cache', (_req, res) => {
  const total = cacheMetrics.hits + cacheMetrics.misses
  res.json({
    hits: cacheMetrics.hits,
    misses: cacheMetrics.misses,
    hitRate: total > 0 ? `${Math.round((cacheMetrics.hits / total) * 100)}%` : '0%',
  })
})

// 404 handler — must come after all routes
app.use(notFoundHandler)

// Global error handler — must be last
app.use(errorHandler)

export default app
