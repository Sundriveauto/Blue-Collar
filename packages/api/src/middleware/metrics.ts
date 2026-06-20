import { Request, Response, NextFunction } from 'express';
import * as promClient from 'prom-client';

// HTTP Metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestSize = new promClient.Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

const httpResponseSize = new promClient.Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

// Database Metrics
const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
});

const dbQueryTotal = new promClient.Counter({
  name: 'db_queries_total',
  help: 'Total database queries',
  labelNames: ['operation', 'table', 'status'],
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active database connections',
});

// Business Metrics
const workerRegistrations = new promClient.Counter({
  name: 'bluecollar_worker_registrations_total',
  help: 'Total worker registrations',
  labelNames: ['category', 'status'],
});

const activeWorkers = new promClient.Gauge({
  name: 'bluecollar_workers_active',
  help: 'Number of active workers',
});

const tipsTotal = new promClient.Counter({
  name: 'bluecollar_tips_total',
  help: 'Total tips/payments sent',
  labelNames: ['currency'],
});

const tipValueUsd = new promClient.Counter({
  name: 'bluecollar_tips_value_usd_total',
  help: 'Total tips/payments value in USD',
  labelNames: ['currency'],
});

const usersTotal = new promClient.Gauge({
  name: 'bluecollar_users_total',
  help: 'Total users',
  labelNames: ['role'],
});

const usersVerified = new promClient.Gauge({
  name: 'bluecollar_users_verified',
  help: 'Total verified users',
  labelNames: ['role'],
});

const reviewsTotal = new promClient.Counter({
  name: 'bluecollar_reviews_total',
  help: 'Total reviews created',
});

const reviewsAvgRating = new promClient.Gauge({
  name: 'bluecollar_reviews_avg_rating',
  help: 'Average review rating',
  labelNames: ['category'],
});

// Contract Metrics
const contractRegistrations = new promClient.Counter({
  name: 'bluecollar_contract_registrations_total',
  help: 'Total contract registration attempts',
  labelNames: ['status'],
});

const contractTransactions = new promClient.Counter({
  name: 'bluecollar_contract_transactions_total',
  help: 'Total contract transactions',
  labelNames: ['type', 'status'],
});

const contractGasUsed = new promClient.Histogram({
  name: 'bluecollar_contract_gas_used',
  help: 'Gas used per contract transaction',
  labelNames: ['type'],
  buckets: [10000, 50000, 100000, 500000, 1000000],
});

// Cache Metrics
const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_name'],
});

const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_name'],
});

// Middleware to track HTTP requests
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestSize = parseInt(req.headers['content-length'] || '0', 10);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const statusCode = res.statusCode;
    const responseSize = parseInt(res.getHeader('content-length') as string || '0', 10);

    httpRequestDuration.labels(req.method, route, statusCode).observe(duration);
    httpRequestTotal.labels(req.method, route, statusCode).inc();
    httpRequestSize.labels(req.method, route).observe(requestSize);
    httpResponseSize.labels(req.method, route, statusCode).observe(responseSize);
  });

  next();
}

// Endpoint to expose metrics
export function metricsEndpoint(req: Request, res: Response) {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
}

// Database query tracking
export function trackDbQuery(operation: string, table: string, duration: number, status: string = 'success') {
  dbQueryDuration.labels(operation, table).observe(duration / 1000);
  dbQueryTotal.labels(operation, table, status).inc();
}

export function setActiveConnections(count: number) {
  activeConnections.set(count);
}

// Business metrics recording
export function recordWorkerRegistration(category: string, status: string = 'success') {
  workerRegistrations.labels(category, status).inc();
}

export function setActiveWorkers(count: number) {
  activeWorkers.set(count);
}

export function recordTip(amount: number, currency: string = 'XLM', usdValue: number = 0) {
  tipsTotal.labels(currency).inc();
  tipValueUsd.labels(currency).inc(usdValue);
}

export function setUsersTotal(count: number, role: string = 'all') {
  usersTotal.labels(role).set(count);
}

export function setUsersVerified(count: number, role: string = 'all') {
  usersVerified.labels(role).set(count);
}

export function recordReview(rating: number, category: string = 'all') {
  reviewsTotal.inc();
  // Update average (requires separate metric tracking)
}

export function recordContractRegistration(status: string = 'success') {
  contractRegistrations.labels(status).inc();
}

export function recordContractTransaction(type: string, status: string = 'success', gasUsed?: number) {
  contractTransactions.labels(type, status).inc();
  if (gasUsed) {
    contractGasUsed.labels(type).observe(gasUsed);
  }
}

export function recordCacheHit(cacheName: string = 'default') {
  cacheHits.labels(cacheName).inc();
}

export function recordCacheMiss(cacheName: string = 'default') {
  cacheMisses.labels(cacheName).inc();
}

// Default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics();
