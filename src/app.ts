import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { traceIdMiddleware } from './middleware/traceId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { swaggerSpec } from './config/swagger';
import { successResponse, errorResponse } from './utils/response';
import { env } from './config/env';
import { prisma } from './utils/prisma';
import authRoutes from './modules/auth/auth.routes';
import meetingRoutes from './modules/meetings/meetings.routes';
import analysisRoutes from './modules/analysis/analysis.routes';
import actionItemRoutes from './modules/actionItems/actionItems.routes';

const app = express();

// ── Trust Proxy (required behind Railway / any reverse proxy for accurate IP) ──

app.set('trust proxy', 1);

// ── Security Middleware (EXACT order: helmet → cors → hpp → json → traceId → logger → routes → 404 → errorHandler) ──

// Helmet: sets ~15 security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(helmet());

// CORS: restrict to allowed origins (not wildcard)
const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // Cache preflight for 24h
  })
);

// HPP: protect against HTTP Parameter Pollution
app.use(hpp());

// Body parser with size limit to prevent payload bombs
app.use(express.json({ limit: '10kb' }));

// Trace ID and request logging
app.use(traceIdMiddleware);
app.use(requestLogger);

// ── Rate Limiters ──

// Global: 100 requests per 15 min per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later' },
  },
});
app.use('/api', globalLimiter);

// Auth: 10 attempts per 15 min per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many authentication attempts, please try again later' },
  },
});

// Analysis: 20 per hour per IP (protects Gemini API billing)
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Analysis rate limit exceeded, please try again later' },
  },
});

// ── Public Routes ──

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is running
 */
app.get('/health', async (req, res) => {
  // Deep health check: verify DB connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json(successResponse({ status: 'UP', database: 'connected' }, req.traceId));
  } catch {
    res.status(503).json(
      errorResponse('SERVICE_UNAVAILABLE', 'Database connection failed', req.traceId)
    );
  }
});

/**
 * @swagger
 * /api/evaluation:
 *   get:
 *     summary: Evaluation endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Evaluation metadata
 */
app.get('/api/evaluation', (req, res) => {
  res.status(200).json(
    successResponse(
      {
        candidateName: 'Krish Kukreja',
        email: 'krish.kukreja@example.com',
        repositoryUrl: 'https://github.com/Krish-kukreja/hintro-meeting-intelligence',
        deployedUrl: 'https://placeholder.up.railway.app',
        externalIntegration: 'Resend Email API',
        features: [
          'Authentication',
          'Meeting Management',
          'AI Analysis',
          'Action Item Management',
          'Overdue Detection',
          'Scheduled Reminders',
          'Email Integration',
        ],
      },
      req.traceId
    )
  );
});

// ── API Documentation (gated in production) ──

if (env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Hintro API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
}

// ── API Routes ──

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/meetings', analysisLimiter, analysisRoutes);
app.use('/api/action-items', actionItemRoutes);

// ── 404 Catch-All (MUST be after all routes, before error handler) ──

app.use((req, res) => {
  res.status(404).json(
    errorResponse('NOT_FOUND', `Route ${req.method} ${req.path} not found`, req.traceId)
  );
});

// ── Error Handler (MUST be last) ──

app.use(errorHandler);

export default app;
