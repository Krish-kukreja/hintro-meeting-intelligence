import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { UuidParamSchema } from '../../utils/uuid.schema';
import * as analysisController from './analysis.controller';

const router = Router();

/**
 * @swagger
 * /meetings/{id}/analyze:
 *   post:
 *     summary: Run AI analysis on a meeting transcript
 *     description: |
 *       Sends the meeting transcript to Gemini 1.5 Flash for analysis.
 *       Returns summary, actionItems, decisions, and followUpSuggestions — all with validated citations.
 *       Retries once on Gemini failure before returning 502.
 *       Auto-creates ActionItem records from the analysis result.
 *     tags: [Analysis]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Meeting ID to analyze
 *     responses:
 *       200:
 *         description: Analysis completed successfully
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
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     meetingId:
 *                       type: string
 *                       format: uuid
 *                     summary:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           text:
 *                             type: string
 *                           citations:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 timestamp:
 *                                   type: string
 *                     actionItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           task:
 *                             type: string
 *                           assignee:
 *                             type: string
 *                           citations:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 timestamp:
 *                                   type: string
 *                     decisions:
 *                       type: array
 *                       items:
 *                         type: object
 *                     followUpSuggestions:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Meeting not found
 *       409:
 *         description: Analysis already exists for this meeting
 *       502:
 *         description: AI analysis failed after retry (LLM_ERROR)
 */
router.post('/:id/analyze', authenticate, validate(UuidParamSchema, 'params'), analysisController.analyzeMeeting);

export default router;
