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

// FIX 1: Add helmet as the VERY FIRST middleware
app.use(helmet());

// FIX 2: Add trust proxy
app.set('trust proxy', 1);

// FIX 4: CORS — KEEP AS IS
app.use(cors({ origin: '*' }));

// FIX 3: Body Size Limit
app.use(express.json({ limit: '10kb' }));

// FIX 5: Add hpp() Middleware
app.use(hpp());

// Trace ID and request logging
app.use(traceIdMiddleware);
app.use(requestLogger);

// FIX 6: Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
app.use(globalLimiter);

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
// Root route for default Railway Healthcheck
app.get('/', (req, res) => {
  res.status(200).send('Hintro Meeting Intelligence API is running');
});

// FIX 15: Deep Health Check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json(successResponse({ status: 'UP', database: 'connected' }, req.traceId));
  } catch (err) {
    // Return 200 so Railway network healthcheck passes even if DB is booting up
    res.status(200).json(successResponse({ status: 'UP', database: 'disconnected', error: String(err) }, req.traceId));
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
        email: 'iamkrish.kukreja@gmail.com',
        repositoryUrl: 'https://github.com/Krish-kukreja/hintro-meeting-intelligence',
        deployedUrl: 'https://hintro-meeting-intelligence-production.up.railway.app',
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

// FIX 14: Gate Swagger UI (REMOVED GATE: Assignment requires it to be publicly accessible)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Hintro API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
}));

// ── API Routes ──

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/meetings', analysisRoutes);
app.use('/api/action-items', actionItemRoutes);

// FIX 13: 404 Catch-All Handler
app.use((req, res) => {
  res.status(404).json(
    errorResponse('NOT_FOUND', `Route ${req.method} ${req.path} not found`, req.traceId)
  );
});

// ── Error Handler (MUST be last) ──
app.use(errorHandler);

export default app;
