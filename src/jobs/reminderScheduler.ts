import cron from 'node-cron';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { sendReminderEmail } from '../integrations/resend';
import { env } from '../config/env';

export function startReminderScheduler(): void {
  const schedule = env.REMINDER_CRON_SCHEDULE;

  logger.info('Starting reminder scheduler', { schedule });

  cron.schedule(schedule, async () => {
    const traceId = crypto.randomUUID();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    logger.info('Reminder cron job started', { traceId, timestamp: now.toISOString() });

    try {
      // Query overdue action items that haven't been reminded in the last 24h
      const overdueItems = await prisma.actionItem.findMany({
        where: {
          status: { not: 'COMPLETED' },
          dueDate: { lt: now },
          reminders: {
            none: {
              sentAt: { gte: twentyFourHoursAgo },
            },
          },
        },
        include: {
          meeting: { select: { title: true } },
        },
      });

      logger.info('Overdue items found for reminders', {
        traceId,
        count: overdueItems.length,
      });

      for (const item of overdueItems) {
        const emailResult = await sendReminderEmail(
          {
            id: item.id,
            task: item.task,
            assignee: item.assignee,
            dueDate: item.dueDate,
          },
          traceId
        );

        // Create ReminderLog entry
        await prisma.reminderLog.create({
          data: {
            actionItemId: item.id,
            channel: 'email',
            deliveryStatus: emailResult.success ? 'SUCCESS' : 'FAILED',
            response: emailResult.error || null,
          },
        });

        logger.info('Reminder processed', {
          traceId,
          actionItemId: item.id,
          deliveryStatus: emailResult.success ? 'SUCCESS' : 'FAILED',
          sentAt: new Date().toISOString(),
        });
      }

      logger.info('Reminder cron job completed', { traceId, processed: overdueItems.length });
    } catch (err) {
      logger.error('Reminder cron job failed', {
        traceId,
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
    }
  });

  logger.info('Reminder scheduler registered successfully');
}
