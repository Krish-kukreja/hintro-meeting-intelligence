import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { CreateMeetingSchema } from './meetings.schema';
import { UuidParamSchema } from '../../utils/uuid.schema';
import * as meetingsController from './meetings.controller';

const router = Router();

// All meeting routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /meetings:
 *   post:
 *     summary: Create a new meeting
 *     description: Stores a meeting with its transcript for later AI analysis. Requires authentication.
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, participants, meetingDate, transcript]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Sprint Planning Q3
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *                 example: ["alice@example.com", "bob@example.com"]
 *               meetingDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-06-01T10:00:00.000Z"
 *               transcript:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [timestamp, speaker, text]
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       example: "00:01"
 *                     speaker:
 *                       type: string
 *                       example: Alice
 *                     text:
 *                       type: string
 *                       example: Let us discuss the roadmap.
 *     responses:
 *       201:
 *         description: Meeting created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized — missing or invalid JWT
 */
router.post('/', validate(CreateMeetingSchema), meetingsController.createMeeting);

/**
 * @swagger
 * /meetings:
 *   get:
 *     summary: List meetings with pagination and date filtering
 *     description: Returns paginated meetings for the authenticated user. Supports optional date range filtering.
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page (max 100)
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter meetings on or after this date (ISO 8601)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter meetings on or before this date (ISO 8601)
 *     responses:
 *       200:
 *         description: Paginated list of meetings
 *       400:
 *         description: Validation error (e.g. limit > 100)
 *       401:
 *         description: Unauthorized
 */
router.get('/', meetingsController.listMeetings);

/**
 * @swagger
 * /meetings/{id}:
 *   get:
 *     summary: Get a meeting by ID
 *     description: Returns the full meeting record including analysis and action items if available.
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Meeting UUID
 *     responses:
 *       200:
 *         description: Meeting details with analysis and action items
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Meeting not found
 */
router.get('/:id', validate(UuidParamSchema, 'params'), meetingsController.getMeeting);

export default router;
