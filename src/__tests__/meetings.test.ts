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

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const TEST_USER_ID = 'user-uuid-123';
const TEST_JWT = jwt.sign(
  { userId: TEST_USER_ID, email: 'test@example.com' },
  'test-jwt-secret-key-for-testing!',
  { expiresIn: '7d' }
);

const validMeetingPayload = {
  title: 'Sprint Planning',
  participants: ['alice@example.com', 'bob@example.com'],
  meetingDate: '2024-06-01T10:00:00.000Z',
  transcript: [
    { timestamp: '00:00:01', speaker: 'Alice', text: 'Let us start the sprint planning.' },
    { timestamp: '00:01:30', speaker: 'Bob', text: 'I have the backlog ready.' },
  ],
};

const mockMeeting = {
  id: 'meeting-uuid-123',
  userId: TEST_USER_ID,
  title: 'Sprint Planning',
  participants: ['alice@example.com', 'bob@example.com'],
  meetingDate: new Date('2024-06-01T10:00:00.000Z'),
  transcript: validMeetingPayload.transcript,
  createdAt: new Date('2024-06-01T12:00:00.000Z'),
  updatedAt: new Date('2024-06-01T12:00:00.000Z'),
};

describe('Meetings Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── CREATE ──

  describe('POST /api/meetings', () => {
    it('should create a meeting and return 201', async () => {
      (mockedPrisma.meeting.create as jest.Mock).mockResolvedValue(mockMeeting);

      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send(validMeetingPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id', 'meeting-uuid-123');
      expect(res.body.data).toHaveProperty('title', 'Sprint Planning');
      expect(res.body).toHaveProperty('traceId');
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .send(validMeetingPayload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 VALIDATION_ERROR for empty title', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({ ...validMeetingPayload, title: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR for empty transcript', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({ ...validMeetingPayload, transcript: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR for invalid participant email', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({ ...validMeetingPayload, participants: ['not-an-email'] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── LIST ──

  describe('GET /api/meetings', () => {
    it('should list meetings with pagination and return 200', async () => {
      const meetings = [mockMeeting];
      (mockedPrisma.meeting.findMany as jest.Mock).mockResolvedValue(meetings);
      (mockedPrisma.meeting.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/meetings')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('meetings');
      expect(Array.isArray(res.body.data.meetings)).toBe(true);
      expect(res.body.data).toHaveProperty('pagination');
      expect(res.body.data.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter meetings by date range and return 200', async () => {
      (mockedPrisma.meeting.findMany as jest.Mock).mockResolvedValue([mockMeeting]);
      (mockedPrisma.meeting.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app)
        .get('/api/meetings')
        .query({
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-12-31T23:59:59.000Z',
        })
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify Prisma was called with date filters
      const findManyCall = (mockedPrisma.meeting.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.meetingDate).toBeDefined();
      expect(findManyCall.where.meetingDate.gte).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(findManyCall.where.meetingDate.lte).toEqual(new Date('2024-12-31T23:59:59.000Z'));
    });

    it('should return 400 for invalid limit (> 100)', async () => {
      const res = await request(app)
        .get('/api/meetings')
        .query({ limit: 200 })
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── GET BY ID ──

  describe('GET /api/meetings/:id', () => {
    it('should return 200 with full meeting when found', async () => {
      const meetingWithRelations = {
        ...mockMeeting,
        analysis: null,
        actionItems: [],
      };
      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(meetingWithRelations);

      const res = await request(app)
        .get('/api/meetings/meeting-uuid-123')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id', 'meeting-uuid-123');
      expect(res.body.data).toHaveProperty('title', 'Sprint Planning');
      expect(res.body.data).toHaveProperty('analysis');
      expect(res.body.data).toHaveProperty('actionItems');
    });

    it('should return 404 NOT_FOUND when meeting does not exist', async () => {
      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/meetings/nonexistent-uuid')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
