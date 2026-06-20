import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  registerRules, loginRules, forgotPasswordRules,
  resetPasswordRules, verifyAccountRules, resendVerificationRules,
} from '../validations/auth.js'
import { createWorkerRules, updateWorkerRules } from '../validations/worker.js'

export const registry = new OpenAPIRegistry()

// ── Reusable schemas ──────────────────────────────────────────────────────────
const BearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
})

const ErrorSchema = registry.register('Error', z.object({
  status: z.literal('error'),
  message: z.string(),
  code: z.number(),
}))

const SuccessSchema = registry.register('Success', z.object({
  status: z.literal('success'),
  message: z.string(),
  code: z.number(),
}))

const CategorySchema = registry.register('Category', z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
}))

const WorkerSchema = registry.register('Worker', z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  bio: z.string().nullable(),
  isActive: z.boolean(),
  walletAddress: z.string().nullable(),
  avgRating: z.number(),
  reviewCount: z.number(),
  categoryId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}))

const UserSchema = registry.register('User', z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['user', 'curator', 'admin']),
  verified: z.boolean(),
})
)

const TokenResponseSchema = registry.register('TokenResponse', z.object({
  status: z.literal('success'),
  message: z.string(),
  code: z.number(),
  token: z.string(),
  data: UserSchema,
}))

const PaginatedWorkersSchema = registry.register('PaginatedWorkers', z.object({
  status: z.literal('success'),
  data: z.array(WorkerSchema),
  meta: z.object({ total: z.number(), page: z.number(), limit: z.number() }),
}))

// ── Auth ──────────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'post', path: '/api/v1/auth/register', tags: ['Auth'],
  summary: 'Register a new account',
  request: { body: { content: { 'application/json': { schema: registerRules } } } },
  responses: {
    201: { description: 'Account created', content: { 'application/json': { schema: TokenResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    409: { description: 'Email already in use', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post', path: '/api/v1/auth/login', tags: ['Auth'],
  summary: 'Login with email and password',
  request: { body: { content: { 'application/json': { schema: loginRules } } } },
  responses: {
    202: { description: 'Login successful', content: { 'application/json': { schema: TokenResponseSchema } } },
    401: { description: 'Invalid credentials', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'delete', path: '/api/v1/auth/logout', tags: ['Auth'],
  summary: 'Logout (revokes refresh tokens)',
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    200: { description: 'Logged out', content: { 'application/json': { schema: SuccessSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'get', path: '/api/v1/auth/me', tags: ['Auth'],
  summary: 'Get current user',
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    200: { description: 'Current user', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: UserSchema }) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post', path: '/api/v1/auth/refresh', tags: ['Auth'],
  summary: 'Refresh access token',
  responses: {
    200: { description: 'New token pair', content: { 'application/json': { schema: TokenResponseSchema } } },
    401: { description: 'Invalid refresh token', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'put', path: '/api/v1/auth/verify-account', tags: ['Auth'],
  summary: 'Verify email address',
  request: { body: { content: { 'application/json': { schema: verifyAccountRules } } } },
  responses: {
    200: { description: 'Account verified', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Invalid token', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post', path: '/api/v1/auth/resend-verification', tags: ['Auth'],
  summary: 'Resend verification email',
  request: { body: { content: { 'application/json': { schema: resendVerificationRules } } } },
  responses: { 200: { description: 'Email sent', content: { 'application/json': { schema: SuccessSchema } } } },
})

registry.registerPath({
  method: 'post', path: '/api/v1/auth/forgot-password', tags: ['Auth'],
  summary: 'Request password reset email',
  request: { body: { content: { 'application/json': { schema: forgotPasswordRules } } } },
  responses: { 200: { description: 'Reset email sent (always 200)', content: { 'application/json': { schema: SuccessSchema } } } },
})

registry.registerPath({
  method: 'put', path: '/api/v1/auth/reset-password', tags: ['Auth'],
  summary: 'Reset password with token',
  request: { body: { content: { 'application/json': { schema: resetPasswordRules } } } },
  responses: {
    200: { description: 'Password updated', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Invalid or expired token', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'get', path: '/api/v1/auth/google', tags: ['Auth'],
  summary: 'Initiate Google OAuth flow',
  responses: { 302: { description: 'Redirect to Google consent screen' } },
})

registry.registerPath({
  method: 'get', path: '/api/v1/auth/google/callback', tags: ['Auth'],
  summary: 'Google OAuth callback',
  responses: { 302: { description: 'Redirect to frontend with JWT' } },
})

// ── Categories ────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/api/v1/categories', tags: ['Categories'],
  summary: 'List all categories',
  responses: {
    200: { description: 'Category list', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: z.array(CategorySchema) }) } } },
  },
})

registry.registerPath({
  method: 'get', path: '/api/v1/categories/{id}', tags: ['Categories'],
  summary: 'Get a single category',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Category', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: CategorySchema }) } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

// ── Workers ───────────────────────────────────────────────────────────────────
const workerQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
})

registry.registerPath({
  method: 'get', path: '/api/v1/workers', tags: ['Workers'],
  summary: 'List active workers (paginated)',
  request: { query: workerQuerySchema },
  responses: {
    200: { description: 'Worker list', content: { 'application/json': { schema: PaginatedWorkersSchema } } },
  },
})

registry.registerPath({
  method: 'get', path: '/api/v1/workers/mine', tags: ['Workers'],
  summary: 'List my worker listings (curator/admin)',
  security: [{ [BearerAuth.name]: [] }],
  responses: {
    200: { description: 'My workers', content: { 'application/json': { schema: PaginatedWorkersSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'get', path: '/api/v1/workers/{id}', tags: ['Workers'],
  summary: 'Get a single worker',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Worker', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: WorkerSchema }) } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post', path: '/api/v1/workers', tags: ['Workers'],
  summary: 'Create a worker listing (curator)',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: createWorkerRules }, 'multipart/form-data': { schema: createWorkerRules } } } },
  responses: {
    201: { description: 'Worker created', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: WorkerSchema }) } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'put', path: '/api/v1/workers/{id}', tags: ['Workers'],
  summary: 'Update a worker (curator). Use POST + X-HTTP-Method: PUT for file uploads.',
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: updateWorkerRules }, 'multipart/form-data': { schema: updateWorkerRules } } },
  },
  responses: {
    200: { description: 'Worker updated', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: WorkerSchema }) } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'delete', path: '/api/v1/workers/{id}', tags: ['Workers'],
  summary: 'Delete a worker (curator)',
  security: [{ [BearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Deleted', content: { 'application/json': { schema: SuccessSchema } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'patch', path: '/api/v1/workers/{id}/toggle', tags: ['Workers'],
  summary: 'Toggle worker active status (curator)',
  security: [{ [BearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Status toggled', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: WorkerSchema }) } } },
  },
})

registry.registerPath({
  method: 'post', path: '/api/v1/workers/{id}/reviews', tags: ['Workers'],
  summary: 'Submit a review for a worker',
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ rating: z.number().int().min(1).max(5), comment: z.string().optional() }) } } },
  },
  responses: {
    201: { description: 'Review created', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post', path: '/api/v1/workers/{id}/bookmark', tags: ['Workers'],
  summary: 'Toggle bookmark on a worker',
  security: [{ [BearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: 'Bookmark toggled', content: { 'application/json': { schema: SuccessSchema } } } },
})

registry.registerPath({
  method: 'post', path: '/api/v1/workers/{id}/contact', tags: ['Workers'],
  summary: 'Send a contact request to a worker',
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ message: z.string().min(10) }) } } },
  },
  responses: { 201: { description: 'Request sent', content: { 'application/json': { schema: SuccessSchema } } } },
})

// ── Users ─────────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'patch', path: '/api/v1/users/me', tags: ['Users'],
  summary: 'Update own profile',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ firstName: z.string().optional(), lastName: z.string().optional(), phone: z.string().optional(), bio: z.string().optional() }) } } } },
  responses: {
    200: { description: 'Profile updated', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: UserSchema }) } } },
  },
})

registry.registerPath({
  method: 'put', path: '/api/v1/users/me/password', tags: ['Users'],
  summary: 'Change password',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }) } } } },
  responses: {
    200: { description: 'Password changed', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Wrong current password', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'delete', path: '/api/v1/users/me', tags: ['Users'],
  summary: 'Delete own account',
  security: [{ [BearerAuth.name]: [] }],
  responses: { 200: { description: 'Account deleted', content: { 'application/json': { schema: SuccessSchema } } } },
})

registry.registerPath({
  method: 'get', path: '/api/v1/users/me/bookmarks', tags: ['Users'],
  summary: 'List bookmarked workers',
  security: [{ [BearerAuth.name]: [] }],
  responses: { 200: { description: 'Bookmarks', content: { 'application/json': { schema: PaginatedWorkersSchema } } } },
})

// ── Payments ──────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/api/v1/payments/fee', tags: ['Payments'],
  summary: 'Get current platform fee',
  responses: { 200: { description: 'Fee info', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: z.object({ fee_bps: z.number() }) }) } } } },
})

registry.registerPath({
  method: 'patch', path: '/api/v1/payments/fee', tags: ['Payments'],
  summary: 'Update platform fee (admin)',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ fee_bps: z.number().int().min(0) }) } } } },
  responses: { 200: { description: 'Fee updated', content: { 'application/json': { schema: SuccessSchema } } } },
})

registry.registerPath({
  method: 'post', path: '/api/v1/payments/tip', tags: ['Payments'],
  summary: 'Send a tip to a worker via Stellar',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ from: z.string(), to: z.string(), amount: z.number().positive() }) } } } },
  responses: {
    200: { description: 'Tip sent', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Invalid request', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post', path: '/api/v1/payments/escrow', tags: ['Payments'],
  summary: 'Create an escrow payment',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ from: z.string(), to: z.string(), amount: z.number().positive(), expiryDate: z.string() }) } } } },
  responses: {
    201: { description: 'Escrow created', content: { 'application/json': { schema: SuccessSchema } } },
  },
})

// ── Admin ─────────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/api/v1/admin/stats', tags: ['Admin'],
  summary: 'Platform statistics (admin)',
  security: [{ [BearerAuth.name]: [] }],
  responses: { 200: { description: 'Stats', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: z.record(z.unknown()) }) } } } },
})

registry.registerPath({
  method: 'get', path: '/api/v1/admin/workers', tags: ['Admin'],
  summary: 'List all workers (admin)',
  security: [{ [BearerAuth.name]: [] }],
  responses: { 200: { description: 'Workers', content: { 'application/json': { schema: PaginatedWorkersSchema } } } },
})

registry.registerPath({
  method: 'get', path: '/api/v1/admin/users', tags: ['Admin'],
  summary: 'List all users (admin)',
  security: [{ [BearerAuth.name]: [] }],
  responses: { 200: { description: 'Users', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: z.array(UserSchema) }) } } } },
})

registry.registerPath({
  method: 'post', path: '/api/v1/admin/workers/bulk-toggle', tags: ['Admin'],
  summary: 'Bulk toggle worker active status (admin)',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ ids: z.array(z.string()).min(1) }) } } } },
  responses: { 200: { description: 'Toggled', content: { 'application/json': { schema: SuccessSchema } } } },
})

registry.registerPath({
  method: 'delete', path: '/api/v1/admin/workers/bulk-delete', tags: ['Admin'],
  summary: 'Bulk delete workers (admin)',
  security: [{ [BearerAuth.name]: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ ids: z.array(z.string()).min(1) }) } } } },
  responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: SuccessSchema } } } },
})

// ── Health ────────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/health', tags: ['Health'],
  summary: 'Liveness check',
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } } } },
})

registry.registerPath({
  method: 'get', path: '/ready', tags: ['Health'],
  summary: 'Readiness check (DB + Redis)',
  responses: {
    200: { description: 'Ready', content: { 'application/json': { schema: z.object({ status: z.string(), checks: z.record(z.unknown()) }) } } },
    503: { description: 'Degraded', content: { 'application/json': { schema: z.object({ status: z.string(), checks: z.record(z.unknown()) }) } } },
  },
})

// ── Generate ──────────────────────────────────────────────────────────────────
export function buildSpec() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'BlueCollar API', version: '1.0.0', description: 'Decentralised skilled-worker marketplace built on Stellar.' },
    servers: [{ url: 'http://localhost:3000', description: 'Local' }],
  })
}
