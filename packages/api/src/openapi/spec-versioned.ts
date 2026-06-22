import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  registerRules, loginRules, forgotPasswordRules,
  resetPasswordRules, verifyAccountRules, resendVerificationRules,
} from '../validations/auth.js'
import { createWorkerRules, updateWorkerRules } from '../validations/worker.js'

/**
 * Generate OpenAPI spec for a specific API version
 */
export function generateVersionedOpenAPISpec(version: 'v1' | 'v2') {
  const registry = new OpenAPIRegistry()
  const basePath = `/api/${version}`

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

  // v2 worker schema has additional fields
  const WorkerSchemaV2 = registry.register('WorkerV2', z.object({
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
    verificationStatus: z.enum(['unverified', 'pending', 'verified']).default('unverified'),
    createdAt: z.string(),
    updatedAt: z.string(),
  }))

  const WorkerSchemaV1 = registry.register('WorkerV1', z.object({
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

  const WorkerSchema = version === 'v2' ? WorkerSchemaV2 : WorkerSchemaV1

  const UserSchema = registry.register('User', z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.enum(['user', 'curator', 'admin']),
    verified: z.boolean(),
  }))

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

  // ── Version info endpoint ─────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get', path: `${basePath}/versions`, tags: ['System'],
    summary: 'Get API version information',
    responses: {
      200: {
        description: 'Version information',
        content: {
          'application/json': {
            schema: z.object({
              versions: z.array(z.object({
                version: z.string(),
                status: z.enum(['current', 'deprecated']),
                rateLimiting: z.record(z.any()),
                authPolicy: z.record(z.any()),
              })),
              current: z.string(),
            }),
          },
        },
      },
    },
  })

  // ── Auth ──────────────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'post', path: `${basePath}/auth/register`, tags: ['Auth'],
    summary: 'Register a new account',
    request: { body: { content: { 'application/json': { schema: registerRules } } } },
    responses: {
      201: { description: 'Account created', content: { 'application/json': { schema: TokenResponseSchema } } },
      400: { description: 'Validation error', content: { 'application/json': { schema: ErrorSchema } } },
      409: { description: 'Email already in use', content: { 'application/json': { schema: ErrorSchema } } },
    },
  })

  registry.registerPath({
    method: 'post', path: `${basePath}/auth/login`, tags: ['Auth'],
    summary: 'Login with email and password',
    request: { body: { content: { 'application/json': { schema: loginRules } } } },
    responses: {
      202: { description: 'Login successful', content: { 'application/json': { schema: TokenResponseSchema } } },
      401: { description: 'Invalid credentials', content: { 'application/json': { schema: ErrorSchema } } },
    },
  })

  registry.registerPath({
    method: 'delete', path: `${basePath}/auth/logout`, tags: ['Auth'],
    summary: 'Logout (revokes refresh tokens)',
    security: [{ [BearerAuth.name]: [] }],
    responses: {
      200: { description: 'Logged out', content: { 'application/json': { schema: SuccessSchema } } },
    },
  })

  // ── Categories ────────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get', path: `${basePath}/categories`, tags: ['Categories'],
    summary: 'List all categories',
    responses: {
      200: { description: 'Category list', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: z.array(CategorySchema) }) } } },
    },
  })

  registry.registerPath({
    method: 'get', path: `${basePath}/categories/{id}`, tags: ['Categories'],
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
    verificationStatus: version === 'v2' ? z.string().optional() : z.never().optional(),
  })

  registry.registerPath({
    method: 'get', path: `${basePath}/workers`, tags: ['Workers'],
    summary: 'List active workers (paginated)',
    request: { query: workerQuerySchema },
    responses: {
      200: { description: 'Worker list', content: { 'application/json': { schema: PaginatedWorkersSchema } } },
    },
  })

  registry.registerPath({
    method: 'get', path: `${basePath}/workers/{id}`, tags: ['Workers'],
    summary: 'Get a single worker',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Worker', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: WorkerSchema }) } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  })

  registry.registerPath({
    method: 'post', path: `${basePath}/workers`, tags: ['Workers'],
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
    method: 'put', path: `${basePath}/workers/{id}`, tags: ['Workers'],
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
    method: 'delete', path: `${basePath}/workers/{id}`, tags: ['Workers'],
    summary: 'Delete a worker (curator)',
    security: [{ [BearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: SuccessSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  })

  registry.registerPath({
    method: 'patch', path: `${basePath}/workers/{id}/toggle`, tags: ['Workers'],
    summary: 'Toggle worker active status (curator)',
    security: [{ [BearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Status toggled', content: { 'application/json': { schema: z.object({ status: z.literal('success'), data: WorkerSchema }) } } },
    },
  })

  // Generate OpenAPI spec
  const generator = new OpenApiGeneratorV31(registry.definitions)

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'BlueCollar API',
      version,
      description: `BlueCollar API - Version ${version}`,
      contact: { name: 'BlueCollar Team' },
    },
    servers: [
      { url: `http://localhost:3000/api/${version}`, description: 'Local' },
      { url: `https://api.bluecollar.app/api/${version}`, description: 'Production' },
    ],
  })
}

/**
 * Export v1 and v2 OpenAPI specs
 */
export const openApiSpecV1 = generateVersionedOpenAPISpec('v1')
export const openApiSpecV2 = generateVersionedOpenAPISpec('v2')
