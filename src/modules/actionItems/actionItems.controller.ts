import { Request, Response, NextFunction } from 'express';
import * as actionItemsService from './actionItems.service';
import { successResponse, errorResponse } from '../../utils/response';
import { ListActionItemsQuerySchema } from './actionItems.schema';

export async function createActionItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!;
    const result = await actionItemsService.createActionItem(userId, req.body);

    if (result.error === 'NOT_FOUND') {
      res.status(404).json(
        errorResponse('NOT_FOUND', 'Meeting not found', req.traceId)
      );
      return;
    }

    res.status(201).json(successResponse(result.actionItem, req.traceId));
  } catch (err) {
    next(err);
  }
}

export async function listActionItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!;

    const parsed = ListActionItemsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const result = await actionItemsService.listActionItems(userId, parsed.data);

    res.status(200).json(successResponse(result, req.traceId));
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await actionItemsService.updateStatus(userId, id, req.body.status);

    if (result.error === 'NOT_FOUND') {
      res.status(404).json(
        errorResponse('NOT_FOUND', 'Action item not found', req.traceId)
      );
      return;
    }

    res.status(200).json(successResponse(result.actionItem, req.traceId));
  } catch (err) {
    next(err);
  }
}

export async function getOverdue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!;
    const overdueItems = await actionItemsService.getOverdue(userId);

    res.status(200).json(successResponse(overdueItems, req.traceId));
  } catch (err) {
    next(err);
  }
}
