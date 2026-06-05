import request from 'supertest';
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
    meeting: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    meetingAnalysis: {
      create: jest.fn(),
    },
    actionItem: {
      create: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    reminderLog: {
      create: jest.fn(),
    },
  },
}));

// Mock env
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

// Mock Gemini (needed because analysis routes are mounted)
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const TEST_USER_ID = 'a0000000-0000-0000-0000-000000000001';
const MEETING_ID = 'b0000000-0000-0000-0000-000000000002';
const ACTION_ITEM_ID = 'c0000000-0000-0000-0000-000000000003';

const TEST_JWT = jwt.sign(
  { userId: TEST_USER_ID, email: 'test@example.com' },
  'test-jwt-secret-key-for-testing!',
  { expiresIn: '7d' }
);

const mockMeeting = {
  id: MEETING_ID,
  userId: TEST_USER_ID,
  title: 'Sprint Planning',
  participants: ['alice@example.com'],
  meetingDate: new Date(),
  transcript: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockActionItem = {
  id: ACTION_ITEM_ID,
  meetingId: MEETING_ID,
  task: 'Implement auth module',
  assignee: 'bob@example.com',
  status: 'PENDING',
  dueDate: new Date('2024-01-01T00:00:00.000Z'),
  citations: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  meeting: { title: 'Sprint Planning', userId: TEST_USER_ID },
};

describe('Action Items Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── CREATE ──

  describe('POST /api/action-items', () => {
    it('should create an action item and return 201', async () => {
      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(mockMeeting);
      (mockedPrisma.actionItem.create as jest.Mock).mockResolvedValue(mockActionItem);

      const res = await request(app)
        .post('/api/action-items')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({
          task: 'Implement auth module',
          assignee: 'bob@example.com',
          meetingId: MEETING_ID,
          dueDate: '2024-01-01T00:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('task', 'Implement auth module');
    });

    it('should return 400 VALIDATION_ERROR for invalid assignee email', async () => {
      const res = await request(app)
        .post('/api/action-items')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({
          task: 'Some task',
          assignee: 'not-an-email',
          meetingId: MEETING_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when meeting does not exist', async () => {
      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/action-items')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({
          task: 'Some task',
          assignee: 'bob@example.com',
          meetingId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 VALIDATION_ERROR for missing task', async () => {
      const res = await request(app)
        .post('/api/action-items')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({
          assignee: 'bob@example.com',
          meetingId: MEETING_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── UPDATE STATUS ──

  describe('PATCH /api/action-items/:id/status', () => {
    it('should update status and return 200', async () => {
      const updatedItem = { ...mockActionItem, status: 'COMPLETED' };
      (mockedPrisma.actionItem.findUnique as jest.Mock).mockResolvedValue(mockActionItem);
      (mockedPrisma.actionItem.update as jest.Mock).mockResolvedValue(updatedItem);

      const res = await request(app)
        .patch(`/api/action-items/${ACTION_ITEM_ID}/status`)
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status', 'COMPLETED');
    });

    it('should return 400 for invalid status value', async () => {
      const res = await request(app)
        .patch(`/api/action-items/${ACTION_ITEM_ID}/status`)
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when action item not found', async () => {
      (mockedPrisma.actionItem.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/action-items/nonexistent-uuid/status')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── LIST ──

  describe('GET /api/action-items', () => {
    it('should filter by status and return 200', async () => {
      (mockedPrisma.actionItem.findMany as jest.Mock).mockResolvedValue([mockActionItem]);
      (mockedPrisma.actionItem.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/action-items')
        .query({ status: 'PENDING' })
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('actionItems');
      expect(res.body.data).toHaveProperty('pagination');

      // Verify filter was applied
      const findManyCall = (mockedPrisma.actionItem.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.status).toBe('PENDING');
    });

    it('should filter by assignee and return 200', async () => {
      (mockedPrisma.actionItem.findMany as jest.Mock).mockResolvedValue([mockActionItem]);
      (mockedPrisma.actionItem.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/action-items')
        .query({ assignee: 'bob@example.com' })
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const findManyCall = (mockedPrisma.actionItem.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.assignee).toBe('bob@example.com');
    });
  });

  // ── OVERDUE ──

  describe('GET /api/action-items/overdue', () => {
    it('should return overdue items with 200', async () => {
      const overdueItem = {
        ...mockActionItem,
        dueDate: new Date('2023-01-01T00:00:00.000Z'), // past date
        status: 'PENDING',
      };
      (mockedPrisma.actionItem.findMany as jest.Mock).mockResolvedValue([overdueItem]);

      const res = await request(app)
        .get('/api/action-items/overdue')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should exclude completed items from overdue', async () => {
      (mockedPrisma.actionItem.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/action-items/overdue')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(0);

      // Verify the query excludes COMPLETED
      const findManyCall = (mockedPrisma.actionItem.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.status).toEqual({ not: 'COMPLETED' });
    });
  });
});
