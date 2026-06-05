import dotenv from 'dotenv';
import { validate as validateCron } from 'node-cron';

dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  JWT_SECRET: string;
  DATABASE_URL: string;
  GEMINI_API_KEY: string;
  RESEND_API_KEY: string;
  REMINDER_CRON_SCHEDULE: string;
}

function getEnvVar(key: string, required = true): string {
  const value = process.env[key];
  if (required && (!value || value.trim() === '')) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

function validateEnv(): EnvConfig {
  return {
    PORT: parseInt(getEnvVar('PORT', false) || '3000', 10),
    NODE_ENV: getEnvVar('NODE_ENV', false) || 'development',
    JWT_SECRET: getEnvVar('JWT_SECRET'),
    DATABASE_URL: getEnvVar('DATABASE_URL'),
    GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY'),
    RESEND_API_KEY: getEnvVar('RESEND_API_KEY'),
    REMINDER_CRON_SCHEDULE: getEnvVar('REMINDER_CRON_SCHEDULE', false) || '*/5 * * * *',
  };
}

export const env: EnvConfig = validateEnv();

if (!validateCron(env.REMINDER_CRON_SCHEDULE)) {
  throw new Error(`Invalid REMINDER_CRON_SCHEDULE: ${env.REMINDER_CRON_SCHEDULE}`);
}
