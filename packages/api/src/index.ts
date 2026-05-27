// Entry point for BlueCollar API
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { corsConfig } from './config/cors.js'
import { env } from './config/env.js'
import pinoHttp from 'pino-http'
import methodOverride from 'method-override'
import passport from './config/passport.js'
import authRoutes from './routes/auth.js'
import categoryRoutes from './routes/categories.js'
import workerRoutes from './routes/workers.js'
import portfolioRoutes from './routes/portfolio.js'
import reviewRoutes from './routes/reviews.js'
import subscriptionRoutes from './routes/subscriptions.js'
import { startReminderScheduler } from './services/reminder.service.js'
import { errorHandler } from './middleware/errorHandler.js'
import { logger } from './config/logger.js'

const app = express()
const PORT = env.PORT || 3000
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : []
const connectSrc = ["'self'", ...allowedOrigins]

app.disable('x-powered-by')
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc,
    },
  },
  hsts: {
    maxAge: 31_536_000,
    includeSubDomains: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
}))

app.use(cors(corsConfig))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(pinoHttp())
app.use(methodOverride('X-HTTP-Method'))
app.use(passport.initialize())

app.use('/api/auth', authRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/workers', workerRoutes)
app.use('/api/workers/:workerId/portfolio', portfolioRoutes)
app.use('/api/workers/:workerId/reviews', reviewRoutes)
app.use('/api/subscriptions', subscriptionRoutes)

// Global error handler - must be last
app.use(errorHandler)

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`BlueCollar API running on port ${PORT}`)
    startReminderScheduler()
  })
}

export default app
