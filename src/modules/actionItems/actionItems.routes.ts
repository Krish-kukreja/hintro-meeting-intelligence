import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { CreateActionItemSchema, UpdateStatusSchema } from './actionItems.schema';
import { UuidParamSchema } from '../../utils/uuid.schema';
import * as actionItemsController from './actionItems.controller';

const router = Router();

// All action item routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /action-items/overdue:
 *   get:
 *     summary: Get all overdue action items
 *     description: Returns action items where status ≠ COMPLETED and dueDate < now. Ordered by dueDate ascending.
 *     tags: [Action Items]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of overdue action items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 traceId:
 *                   type: string
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       task:
 *                         type: string
 *                       assignee:
 *                         type: string
 *                         format: email
 *                       status:
 *                         type: string
 *                         enum: [PENDING, IN_PROGRESS]
 *                       dueDate:
 *                         type: string
 *                         format: date-time
 *                       meeting:
 *                         type: object
 *                         properties:
 *                           title:
 *                             type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/overdue', actionItemsController.getOverdue);

/**
 * @swagger
 * /action-items:
 *   post:
 *     summary: Create a new action item
 *     description: Creates an action item linked to a meeting. The meeting must exist and belong to the authenticated user.
 *     tags: [Action Items]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [task, assignee, meetingId]
 *             properties:
 *               task:
 *                 type: string
 *                 minLength: 1
 *                 example: Implement authentication module
 *               assignee:
 *                 type: string
 *                 format: email
 *                 example: bob@example.com
 *               meetingId:
 *                 type: string
 *                 format: uuid
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-07-01T00:00:00.000Z"
 *               citations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       example: "00:10"
 *     responses:
 *       201:
 *         description: Action item created
 *       400:
 *         description: Validation error (invalid email, missing task, etc.)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Meeting not found
 */
router.post('/', validate(CreateActionItemSchema), actionItemsController.createActionItem);

/**
 * @swagger
 * /action-items:
 *   get:
 *     summary: List action items with filters
 *     description: Returns paginated action items for the authenticated user. Supports filtering by status, assignee, and meetingId.
 *     tags: [Action Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, COMPLETED]
 *         description: Filter by action item status
 *       - in: query
 *         name: assignee
 *         schema:
 *           type: string
 *           format: email
 *         description: Filter by assignee email
 *       - in: query
 *         name: meetingId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by meeting ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of action items
 *       401:
 *         description: Unauthorized
 */
router.get('/', actionItemsController.listActionItems);

/**
 * @swagger
 * /action-items/{id}/status:
 *   patch:
 *     summary: Update action item status
 *     description: Updates the status of an action item. Only the meeting owner can update their action items.
 *     tags: [Action Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Action item UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, IN_PROGRESS, COMPLETED]
 *                 example: COMPLETED
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status value
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Action item not found
 */
router.patch('/:id/status', validate(UuidParamSchema, 'params'), validate(UpdateStatusSchema), actionItemsController.updateStatus);

export default router;
