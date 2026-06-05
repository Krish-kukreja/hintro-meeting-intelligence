import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../utils/prisma';
import { validateCitations } from '../modules/analysis/analysis.validator';

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
      createMany: jest.fn(),
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

// Mock Gemini SDK
jest.mock('@google/generative-ai', () => {
  const mockGenerateContent = jest.fn();
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    })),
    __mockGenerateContent: mockGenerateContent,
  };
});

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const { __mockGenerateContent: mockGenerateContent } = jest.requireMock('@google/generative-ai');

const TEST_USER_ID = 'user-uuid-123';
const MEETING_ID = 'meeting-uuid-456';
const TEST_JWT = jwt.sign(
  { userId: TEST_USER_ID, email: 'test@example.com' },
  'test-jwt-secret-key-for-testing!',
  { expiresIn: '7d' }
);

const mockTranscript = [
  { timestamp: '00:01', speaker: 'Alice', text: 'Let us discuss the roadmap.' },
  { timestamp: '00:05', speaker: 'Bob', text: 'I suggest we prioritize the auth module.' },
  { timestamp: '00:10', speaker: 'Alice', text: 'Agreed. Bob will handle auth by Friday.' },
];

const mockGeminiResponse = {
  summary: [
    { text: 'Team discussed roadmap priorities.', citations: [{ timestamp: '00:01' }] },
  ],
  actionItems: [
    { task: 'Handle auth module', assignee: 'bob@example.com', citations: [{ timestamp: '00:10' }] },
  ],
  decisions: [
    { text: 'Auth module is top priority.', citations: [{ timestamp: '00:05' }] },
  ],
  followUpSuggestions: [
    { text: 'Schedule follow-up for auth progress.', citations: [{ timestamp: '00:10' }] },
  ],
};

const mockMeetingNoAnalysis = {
  id: MEETING_ID,
  userId: TEST_USER_ID,
  title: 'Sprint Planning',
  participants: ['alice@example.com', 'bob@example.com'],
  meetingDate: new Date('2024-06-01T10:00:00.000Z'),
  transcript: mockTranscript,
  createdAt: new Date(),
  updatedAt: new Date(),
  analysis: null,
};

const mockSavedAnalysis = {
  id: 'analysis-uuid-789',
  meetingId: MEETING_ID,
  ...mockGeminiResponse,
  createdAt: new Date(),
};

describe('Analysis Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/meetings/:id/analyze', () => {
    it('should analyze a meeting and return 200 with all 4 fields', async () => {
      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(mockMeetingNoAnalysis);
      (mockedPrisma.meetingAnalysis.create as jest.Mock).mockResolvedValue(mockSavedAnalysis);
      (mockedPrisma.actionItem.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockGeminiResponse),
        },
      });

      const res = await request(app)
        .post(`/api/meetings/${MEETING_ID}/analyze`)
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('actionItems');
      expect(res.body.data).toHaveProperty('decisions');
      expect(res.body.data).toHaveProperty('followUpSuggestions');
      expect(res.body).toHaveProperty('traceId');

      // Verify action items were auto-created
      expect(mockedPrisma.actionItem.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            meetingId: MEETING_ID,
            task: 'Handle auth module',
            assignee: 'bob@example.com',
            status: 'PENDING',
            dueDate: null,
          }),
        ]),
      });
    });

    it('should return 409 CONFLICT when analysis already exists', async () => {
      const meetingWithAnalysis = {
        ...mockMeetingNoAnalysis,
        analysis: mockSavedAnalysis,
      };

      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(meetingWithAnalysis);

      const res = await request(app)
        .post(`/api/meetings/${MEETING_ID}/analyze`)
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should return 404 when meeting does not exist', async () => {
      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/meetings/nonexistent-uuid/analyze')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 502 LLM_ERROR when Gemini fails twice', async () => {
      (mockedPrisma.meeting.findUnique as jest.Mock).mockResolvedValue(mockMeetingNoAnalysis);

      mockGenerateContent
        .mockRejectedValueOnce(new Error('Gemini rate limited'))
        .mockRejectedValueOnce(new Error('Gemini still failing'));

      const res = await request(app)
        .post(`/api/meetings/${MEETING_ID}/analyze`)
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('LLM_ERROR');
    }, 15000);
  });

  describe('Citation Validation', () => {
    it('should strip invalid citations and keep valid ones', () => {
      const analysisWithBadCitations = {
        summary: [
          {
            text: 'Discussion about roadmap.',
            citations: [
              { timestamp: '00:01' },       // valid
              { timestamp: '99:99' },       // INVALID
            ],
          },
        ],
        actionItems: [
          {
            task: 'Do something',
            assignee: 'alice@example.com',
            citations: [
              { timestamp: '00:05' },       // valid
              { timestamp: 'FAKE' },        // INVALID
            ],
          },
        ],
        decisions: [
          {
            text: 'Decided something.',
            citations: [{ timestamp: '00:10' }],  // valid
          },
        ],
        followUpSuggestions: [
          {
            text: 'Follow up.',
            citations: [{ timestamp: 'NONEXISTENT' }],  // INVALID
          },
        ],
      };

      const cleaned = validateCitations(analysisWithBadCitations, mockTranscript, 'test-trace');

      // Valid citations kept
      expect(cleaned.summary[0].citations).toHaveLength(1);
      expect(cleaned.summary[0].citations[0].timestamp).toBe('00:01');

      expect(cleaned.actionItems[0].citations).toHaveLength(1);
      expect(cleaned.actionItems[0].citations[0].timestamp).toBe('00:05');

      expect(cleaned.decisions[0].citations).toHaveLength(1);
      expect(cleaned.decisions[0].citations[0].timestamp).toBe('00:10');

      // Invalid citation stripped entirely
      expect(cleaned.followUpSuggestions[0].citations).toHaveLength(0);
    });
  });
});
