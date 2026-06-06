import app from './app';
import { env } from './config/env';
import logger from './utils/logger';
import { startReminderScheduler } from './jobs/reminderScheduler';
import { prisma } from './utils/prisma';
import { redis } from './utils/redis';

const PORT = env.PORT;

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`);
  
  // Start the reminder cron job
  startReminderScheduler();
});

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    await redis.quit();
    logger.info('Server closed, Prisma and Redis disconnected');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
