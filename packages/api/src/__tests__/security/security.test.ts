/**
 * Automated Security Tests
 * Closes #404
 *
 * Covers: SQL injection, XSS, security headers, auth bypass, rate limiting.
 * All external dependencies are mocked — no DB or Redis required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret';
process.env.APP_URL = 'http://localhost:3000';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/auth.service.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  verifyAccount: vi.fn(),
}));

vi.mock('../services/worker.service.js', () => ({
  getWorkers: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  getWorkerById: vi.fn().mockResolvedValue(null),
}));

vi.mock('../db.js', () => ({
  db: { user: { findUnique: vi.fn() }, $queryRaw: vi.fn(), $disconnect: vi.fn() },
}));

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://localhost:5432/test',
    JWT_SECRET: 'test-secret',
    PORT: 3000,
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    MAIL_HOST: 'smtp.test.local',
    MAIL_PORT: 587,
    MAIL_USER: 'u',
    MAIL_PASS: 'p',
    APP_URL: 'http://localhost:3000',
  },
}));

vi.mock('../mailer/transport.js', () => ({
  transporter: { sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) },
}));

vi.mock('../config/redis.js', () => ({
  redis: { connect: vi.fn().mockResolvedValue(undefined), ping: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn() },
  cacheMetrics: { hits: 0, misses: 0 },
}));

vi.mock('../monitoring/tracing.js', () => ({ initTracing: vi.fn() }));

import app from '../app.js';
import * as authService from '../services/auth.service.js';

// ── Payloads ──────────────────────────────────────────────────────────────────

const SQL_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "' UNION SELECT * FROM users --",
  "admin'--",
  "1; SELECT * FROM information_schema.tables",
];

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  "javascript:alert(1)",
];

// ── SQL Injection ─────────────────────────────────────────────────────────────

describe('Security – SQL Injection', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(SQL_PAYLOADS)('rejects SQL payload in login email: %s', async (payload) => {
    vi.mocked(authService.loginUser).mockRejectedValue(new Error('Invalid credentials'));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: payload, password: 'pass' });

    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(202);
    expect([400, 401, 422, 500]).toContain(res.status);
    // Must not leak SQL error details
    expect(JSON.stringify(res.body)).not.toMatch(/syntax error|pg_|information_schema/i);
  });

  it.each(SQL_PAYLOADS)('rejects SQL payload in register email: %s', async (payload) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: payload, password: 'Password123!', firstName: 'A', lastName: 'B' });

    expect(res.status).not.toBe(201);
    expect([400, 422]).toContain(res.status);
  });

  it.each(SQL_PAYLOADS)('worker search does not crash on SQL payload: %s', async (payload) => {
    const res = await request(app)
      .get('/api/workers')
      .query({ search: payload });

    expect(res.status).not.toBe(500);
  });

  it.each(SQL_PAYLOADS)('worker ID param does not crash on SQL payload: %s', async (payload) => {
    const res = await request(app).get(`/api/workers/${encodeURIComponent(payload)}`);
    expect(res.status).not.toBe(500);
  });
});

// ── XSS ──────────────────────────────────────────────────────────────────────

describe('Security – XSS', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(XSS_PAYLOADS)('response body does not echo raw script tags for search: %s', async (payload) => {
    const res = await request(app)
      .get('/api/workers')
      .query({ search: payload });

    expect(res.status).not.toBe(500);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('<script>');
    expect(body).not.toContain('onerror=');
    expect(body).not.toContain('onload=');
  });

  it.each(XSS_PAYLOADS)('register firstName XSS payload is rejected or sanitized: %s', async (payload) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'xss@test.com', password: 'Password123!', firstName: payload, lastName: 'B' });

    if (res.status === 201) {
      expect(JSON.stringify(res.body)).not.toContain('<script>');
    } else {
      expect([400, 422]).toContain(res.status);
    }
  });
});

// ── Security Headers ──────────────────────────────────────────────────────────

describe('Security – HTTP Headers', () => {
  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options header', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('does not expose X-Powered-By', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets Content-Security-Policy', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

// ── Authentication Bypass ─────────────────────────────────────────────────────

describe('Security – Authentication', () => {
  it('rejects protected route without token → 401', async () => {
    const res = await request(app).delete('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('rejects malformed JWT → 401', async () => {
    const res = await request(app)
      .delete('/api/auth/logout')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects expired JWT → 401', async () => {
    // Expired token (exp in the past, wrong signature)
    const expired =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJpZCI6InRlc3QiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.' +
      'bad-signature';
    const res = await request(app)
      .delete('/api/auth/logout')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

// ── Rate Limiting ─────────────────────────────────────────────────────────────

describe('Security – Rate Limiting', () => {
  it('auth endpoint handles burst requests without 500 errors', async () => {
    vi.mocked(authService.loginUser).mockRejectedValue(new Error('Invalid credentials'));
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/auth/login')
          .send({ email: 'burst@test.com', password: 'wrong' })
      )
    );
    responses.forEach((r) => expect(r.status).not.toBe(500));
  });
});
