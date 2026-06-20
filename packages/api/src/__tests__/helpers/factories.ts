import { faker } from '@faker-js/faker';
import argon2 from 'argon2';

/**
 * Test data factories for creating consistent test data
 */

export function createTestUserData(overrides: any = {}) {
  return {
    email: faker.internet.email(),
    password: 'Test123!@#',
    name: faker.person.fullName(),
    role: 'USER',
    is_verified: true,
    ...overrides,
  };
}

export async function createTestUserWithHashedPassword(overrides: any = {}) {
  const userData = createTestUserData(overrides);
  return {
    ...userData,
    password: await argon2.hash(userData.password),
  };
}

export function createTestWorkerData(overrides: any = {}) {
  return {
    name: faker.person.fullName(),
    category: faker.helpers.arrayElement(['plumber', 'electrician', 'carpenter', 'painter']),
    wallet_address: `G${faker.string.alphanumeric(55).toUpperCase()}`,
    is_active: true,
    rating: faker.number.float({ min: 3, max: 5, precision: 0.1 }),
    description: faker.lorem.paragraph(),
    hourly_rate: faker.number.int({ min: 25, max: 150 }),
    ...overrides,
  };
}

export function createTestJobData(overrides: any = {}) {
  return {
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraphs(2),
    category: faker.helpers.arrayElement(['plumber', 'electrician', 'carpenter', 'painter']),
    budget: faker.number.int({ min: 100, max: 5000 }),
    status: 'OPEN',
    ...overrides,
  };
}

export function createTestLocationData(overrides: any = {}) {
  return {
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    country: faker.location.country(),
    postal_code: faker.location.zipCode(),
    latitude: faker.location.latitude(),
    longitude: faker.location.longitude(),
    ...overrides,
  };
}

export function createTestReviewData(overrides: any = {}) {
  return {
    rating: faker.number.int({ min: 1, max: 5 }),
    comment: faker.lorem.paragraph(),
    ...overrides,
  };
}

export function createTestMessageData(overrides: any = {}) {
  return {
    content: faker.lorem.sentences(2),
    is_read: false,
    ...overrides,
  };
}

export function createTestNotificationData(overrides: any = {}) {
  return {
    type: faker.helpers.arrayElement(['JOB_POSTED', 'JOB_ACCEPTED', 'MESSAGE_RECEIVED']),
    title: faker.lorem.sentence(),
    message: faker.lorem.paragraph(),
    is_read: false,
    ...overrides,
  };
}

/**
 * Generate a valid Stellar wallet address
 */
export function generateStellarAddress(): string {
  return `G${faker.string.alphanumeric(55).toUpperCase()}`;
}

/**
 * Generate a JWT token for testing
 */
export function generateTestToken(payload: any = {}): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      role: 'USER',
      ...payload,
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

/**
 * Generate an expired JWT token for testing
 */
export function generateExpiredToken(payload: any = {}): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      role: 'USER',
      ...payload,
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '-1h' } // Expired 1 hour ago
  );
}

/**
 * Create mock request object
 */
export function createMockRequest(overrides: any = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides,
  };
}

/**
 * Create mock response object
 */
export function createMockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Create mock next function
 */
export function createMockNext() {
  return vi.fn();
}
