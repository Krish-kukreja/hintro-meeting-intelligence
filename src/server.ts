import app from './app';
import { env } from './config/env';
import logger from './utils/logger';
import { startReminderScheduler } from './jobs/reminderScheduler';
import { prisma } from './utils/prisma';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info(`Hintro API server started`, {
    port: PORT,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });

  // Start the reminder cron job
  startReminderScheduler();
});

// ── Graceful Shutdown ──
// Ensures in-flight requests complete and DB connections close cleanly during deploys

function gracefulShutdown(signal: string) {
  logger.info(`${signal} received — starting graceful shutdown`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await prisma.$disconnect();
      logger.info('Database connection closed');
    } catch (err) {
      logger.error('Error disconnecting from database', { error: (err as Error).message });
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
