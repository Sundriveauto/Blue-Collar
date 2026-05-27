import rateLimit from 'express-rate-limit'

const STRICT_WINDOW_MS = 15 * 60 * 1000
const MODERATE_WINDOW_MS = 60 * 60 * 1000

const rateLimitResponse = {
  status: 'error',
  message: 'Too many requests, please try again later.',
  code: 429,
}

export const strictAuthRateLimiter = rateLimit({
  windowMs: STRICT_WINDOW_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.setHeader('Retry-After', String(Math.ceil(STRICT_WINDOW_MS / 1000)))
    res.status(429).json(rateLimitResponse)
  },
})

export const moderateAuthRateLimiter = rateLimit({
  windowMs: MODERATE_WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.setHeader('Retry-After', String(Math.ceil(MODERATE_WINDOW_MS / 1000)))
    res.status(429).json(rateLimitResponse)
  },
})
