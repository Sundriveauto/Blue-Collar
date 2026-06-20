import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index';
import { prisma } from '../setup';
import {
  createTestUserWithHashedPassword,
  createTestWorkerData,
  generateTestToken,
} from '../helpers/factories';

describe('Worker API Integration Tests', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    // Create test user
    const userData = await createTestUserWithHashedPassword({ role: 'USER' });
    const user = await prisma.user.create({ data: userData });
    userId = user.id;
    authToken = generateTestToken({ id: user.id, email: user.email, role: user.role });
  });

  describe('POST /api/workers', () => {
    it('should create a new worker with valid data', async () => {
      const workerData = createTestWorkerData({ owner_id: userId });

      const response = await request(app)
        .post('/api/workers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workerData);

      expect(response.status).toBe(201);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe(workerData.name);
      expect(response.body.data.category).toBe(workerData.category);
    });

    it('should reject worker creation without authentication', async () => {
      const workerData = createTestWorkerData();

      const response = await request(app)
        .post('/api/workers')
        .send(workerData);

      expect(response.status).toBe(401);
    });

    it('should reject worker creation with invalid data', async () => {
      const response = await request(app)
        .post('/api/workers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invalid: 'data' });

      expect(response.status).toBe(422);
    });

    it('should reject worker creation with invalid wallet address', async () => {
      const workerData = createTestWorkerData({
        owner_id: userId,
        wallet_address: 'invalid-address',
      });

      const response = await request(app)
        .post('/api/workers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workerData);

      expect(response.status).toBe(422);
    });
  });

  describe('GET /api/workers', () => {
    beforeEach(async () => {
      // Create test workers
      await prisma.worker.createMany({
        data: [
          createTestWorkerData({ owner_id: userId, category: 'plumber' }),
          createTestWorkerData({ owner_id: userId, category: 'electrician' }),
          createTestWorkerData({ owner_id: userId, category: 'plumber' }),
        ],
      });
    });

    it('should return all workers', async () => {
      const response = await request(app).get('/api/workers');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
    });

    it('should filter workers by category', async () => {
      const response = await request(app)
        .get('/api/workers')
        .query({ category: 'plumber' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((w: any) => w.category === 'plumber')).toBe(true);
    });

    it('should paginate workers', async () => {
      const response = await request(app)
        .get('/api/workers')
        .query({ page: 1, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toBeDefined();
    });

    it('should search workers by name', async () => {
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: userId, name: 'John Smith' }),
      });

      const response = await request(app)
        .get('/api/workers')
        .query({ search: 'John' });

      expect(response.status).toBe(200);
      expect(response.body.data.some((w: any) => w.id === worker.id)).toBe(true);
    });
  });

  describe('GET /api/workers/:id', () => {
    it('should return worker by id', async () => {
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: userId }),
      });

      const response = await request(app).get(`/api/workers/${worker.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(worker.id);
      expect(response.body.data.name).toBe(worker.name);
    });

    it('should return 404 for non-existent worker', async () => {
      const response = await request(app).get('/api/workers/non-existent-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/workers/:id', () => {
    it('should update worker with valid data', async () => {
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: userId }),
      });

      const response = await request(app)
        .put(`/api/workers/${worker.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should reject update without authentication', async () => {
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: userId }),
      });

      const response = await request(app)
        .put(`/api/workers/${worker.id}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(401);
    });

    it('should reject update by non-owner', async () => {
      const otherUser = await prisma.user.create({
        data: await createTestUserWithHashedPassword(),
      });
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: otherUser.id }),
      });

      const response = await request(app)
        .put(`/api/workers/${worker.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/workers/:id', () => {
    it('should delete worker', async () => {
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: userId }),
      });

      const response = await request(app)
        .delete(`/api/workers/${worker.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(204);

      // Verify deletion
      const deletedWorker = await prisma.worker.findUnique({
        where: { id: worker.id },
      });
      expect(deletedWorker).toBeNull();
    });

    it('should reject deletion without authentication', async () => {
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: userId }),
      });

      const response = await request(app).delete(`/api/workers/${worker.id}`);

      expect(response.status).toBe(401);
    });

    it('should reject deletion by non-owner', async () => {
      const otherUser = await prisma.user.create({
        data: await createTestUserWithHashedPassword(),
      });
      const worker = await prisma.worker.create({
        data: createTestWorkerData({ owner_id: otherUser.id }),
      });

      const response = await request(app)
        .delete(`/api/workers/${worker.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });
});
