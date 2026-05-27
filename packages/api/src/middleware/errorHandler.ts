import type { Request, Response, NextFunction } from 'express'
import { AppError, ErrorCode } from '../utils/AppError.js'
import { logger } from '../config/logger.js'

/**
 * Global error handling middleware for Express.
 * Must be registered as the last middleware in the application.
 *
 * Handles:
 * - Operational AppErrors: exposes message and errorCode to clients
 * - Prisma known errors (P2002 unique, P2025 not found): mapped to 409/404
 * - Unexpected errors: logged with full context, returns generic 500
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // ── Prisma error mapping ──────────────────────────────────────────────────
  if (isPrismaError(err)) {
    const mapped = mapPrismaError(err)
    return res.status(mapped.statusCode).json({
      status: 'error',
      message: mapped.message,
      code: mapped.statusCode,
      errorCode: mapped.errorCode,
    })
  }

  // ── Operational AppError ──────────────────────────────────────────────────
  if (err instanceof AppError && err.isOperational) {
    if (err.statusCode >= 500) {
      logError(err, req)
    }
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      code: err.statusCode,
      errorCode: err.errorCode,
    })
  }

  // ── Unexpected / programmer error ─────────────────────────────────────────
  const error = err instanceof Error ? err : new Error(String(err))
  logError(error, req)

  return res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
    code: 500,
    errorCode: ErrorCode.INTERNAL_ERROR,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      originalMessage: error.message,
    }),
  })
}

/**
 * Middleware to handle 404 Not Found errors for unmatched routes.
 * Register after all route handlers but before errorHandler.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(`Route ${req.method} ${req.url} not found`, 404, true, ErrorCode.NOT_FOUND))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function logError(err: Error, req: Request) {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  }, '[ERROR]')
}

interface PrismaClientKnownRequestError {
  code: string
  meta?: Record<string, unknown>
}

function isPrismaError(err: unknown): err is PrismaClientKnownRequestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string' &&
    (err as Record<string, unknown>).code?.toString().startsWith('P')
  )
}

function mapPrismaError(err: PrismaClientKnownRequestError): {
  statusCode: number
  message: string
  errorCode: ErrorCode
} {
  switch (err.code) {
    case 'P2002':
      return { statusCode: 409, message: 'A record with that value already exists', errorCode: ErrorCode.CONFLICT }
    case 'P2025':
      return { statusCode: 404, message: 'Record not found', errorCode: ErrorCode.NOT_FOUND }
    case 'P2003':
      return { statusCode: 400, message: 'Related record not found', errorCode: ErrorCode.VALIDATION_ERROR }
    default:
      return { statusCode: 500, message: 'Database error', errorCode: ErrorCode.INTERNAL_ERROR }
  }
}
