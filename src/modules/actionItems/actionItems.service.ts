import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import logger from '../../utils/logger';
import { CreateActionItemInput, ListActionItemsQuery } from './actionItems.schema';
import { getCache, setCache, invalidatePattern } from '../../utils/redis';

export async function createActionItem(userId: string, data: CreateActionItemInput) {
  logger.info('Creating action item', { userId, meetingId: data.meetingId });

  // Verify meeting exists and belongs to the user
  const meeting = await prisma.meeting.findUnique({
    where: { id: data.meetingId },
  });

  if (!meeting || meeting.userId !== userId) {
    logger.warn('Meeting not found or access denied for action item creation', {
      userId,
      meetingId: data.meetingId,
    });
    return { error: 'NOT_FOUND' };
  }

  const actionItem = await prisma.actionItem.create({
    data: {
      meetingId: data.meetingId,
      task: data.task,
      assignee: data.assignee,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      citations: (data.citations as any) || [],
    },
  });

  logger.info('Action item created', { actionItemId: actionItem.id, meetingId: data.meetingId });

  await invalidatePattern(`actionItems:${userId}:*`);

  return { actionItem };
}

export async function listActionItems(userId: string, query: ListActionItemsQuery) {
  const { status, assignee, meetingId, page, limit } = query;
  const skip = (page - 1) * limit;

  logger.info('Listing action items', { userId, status, assignee, meetingId, page, limit });

  const where: any = {
    meeting: { userId },
  };

  if (status) where.status = status;
  if (assignee) where.assignee = assignee;
  if (meetingId) where.meetingId = meetingId;

  const cacheKey = `actionItems:${userId}:status${status || 'all'}:assignee${assignee || 'all'}:meeting${meetingId || 'all'}:page${page}:limit${limit}`;
  const cached = await getCache<{ actionItems: any[], pagination: any }>(cacheKey);
  if (cached) {
    logger.info('ActionItems cache hit', { cacheKey, userId });
    return cached;
  }

  const [actionItems, total] = await Promise.all([
    prisma.actionItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        meeting: { select: { title: true } },
      },
    }),
    prisma.actionItem.count({ where }),
  ]);

  const result = {
    actionItems,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };

  await setCache(cacheKey, result, 300);
  logger.info('ActionItems cache set', { cacheKey, userId });

  return result;
}

export async function updateStatus(userId: string, actionItemId: string, status: string) {
  logger.info('Updating action item status', { userId, actionItemId, status });

  // Find the action item and verify ownership through meeting
  const actionItem = await prisma.actionItem.findUnique({
    where: { id: actionItemId },
    include: { meeting: { select: { userId: true } } },
  });

  if (!actionItem || actionItem.meeting.userId !== userId) {
    logger.warn('Action item not found or access denied', { userId, actionItemId });
    return { error: 'NOT_FOUND' };
  }

  const updated = await prisma.actionItem.update({
    where: { id: actionItemId },
    data: { status: status as any },
  });

  logger.info('Action item status updated', { actionItemId, oldStatus: actionItem.status, newStatus: status });

  await invalidatePattern(`actionItems:${userId}:*`);

  return { actionItem: updated };
}

export async function getOverdue(userId: string) {
  logger.info('Fetching overdue action items', { userId });

  const now = new Date();

  const overdueItems = await prisma.actionItem.findMany({
    where: {
      meeting: { userId },
      status: { not: 'COMPLETED' },
      dueDate: { lt: now },
    },
    include: {
      meeting: { select: { title: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  logger.info('Overdue action items found', { userId, count: overdueItems.length });

  return overdueItems;
}