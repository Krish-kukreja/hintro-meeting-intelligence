import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../utils/prisma';

// Mock Prisma
jest.mock('../utils/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

// Mock env to avoid validation errors during test
jest.mock('../config/env', () => ({
  env: {
    PORT: 3000,
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-key-for-testing!',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    GEMINI_API_KEY: 'test-gemini-key',
    RESEND_API_KEY: 'test-resend-key',
    REMINDER_CRON_SCHEDULE: '0 9 * * *',
    ALLOWED_ORIGINS: 'http://localhost:3000',
  },
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Auth Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── REGISTER ──

  describe('POST /api/auth/register', () => {
    it('should register a new user and return 201 with user data (no passwordHash)', async () => {
      const mockUser = {
        id: 'uuid-123',
        email: 'test@example.com',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      (mockedPrisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('email', 'test@example.com');
      expect(res.body.data).toHaveProperty('createdAt');
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body).toHaveProperty('traceId');
    });

    it('should return 400 VALIDATION_ERROR for invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR for short password (< 8 chars)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 CONFLICT for duplicate email', async () => {
      const prismaError = new Error('Unique constraint failed') as any;
      prismaError.code = 'P2002';
      prismaError.constructor = { name: 'PrismaClientKnownRequestError' };
      Object.setPrototypeOf(prismaError, Object.getPrototypeOf(prismaError));

      // Simulate Prisma P2002 error
      const { Prisma } = jest.requireActual('@prisma/client');
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002', clientVersion: '5.0.0' }
      );

      (mockedPrisma.user.create as jest.Mock).mockRejectedValue(p2002Error);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'existing@example.com', password: 'password123' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  // ── LOGIN ──

  describe('POST /api/auth/login', () => {
    it('should login successfully and return 200 with token', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: 'uuid-123',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        createdAt: new Date(),
      };

      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('expiresIn', '7d');
      expect(res.body).toHaveProperty('traceId');

      // Verify token is valid JWT
      const decoded = jwt.verify(res.body.data.token, 'test-jwt-secret-key-for-testing!') as any;
      expect(decoded).toHaveProperty('userId', 'uuid-123');
      expect(decoded).toHaveProperty('email', 'test@example.com');
    });

    it('should return 401 UNAUTHORIZED for wrong password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      const mockUser = {
        id: 'uuid-123',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        createdAt: new Date(),
      };

      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 UNAUTHORIZED for unknown email', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
