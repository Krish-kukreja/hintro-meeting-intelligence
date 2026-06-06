import dotenv from 'dotenv';
import { validate as validateCron } from 'node-cron';

dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  JWT_SECRET: string;
  DATABASE_URL: string;
  // LLM API key (Groq)
  GEMINI_API_KEY: string;
  RESEND_API_KEY: string;
  REMINDER_CRON_SCHEDULE: string;
  REDIS_URL: string;
  ALLOWED_ORIGINS: string;
}

function getEnvVar(key: string, required = true): string {
  const value = process.env[key];
  if (required && (!value || value.trim() === '')) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

function validateEnv(): EnvConfig {
  const jwtSecret = getEnvVar('JWT_SECRET');

  // Enforce minimum JWT secret length for security
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  return {
    PORT: parseInt(getEnvVar('PORT', false) || '3000', 10),
    NODE_ENV: getEnvVar('NODE_ENV', false) || 'development',
    JWT_SECRET: jwtSecret,
    DATABASE_URL: getEnvVar('DATABASE_URL'),
    GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY'),
    RESEND_API_KEY: getEnvVar('RESEND_API_KEY'),
    REMINDER_CRON_SCHEDULE: getEnvVar('REMINDER_CRON_SCHEDULE', false) || '*/5 * * * *',
    REDIS_URL: getEnvVar('REDIS_URL', false) || 'redis://localhost:6379',
    ALLOWED_ORIGINS: getEnvVar('ALLOWED_ORIGINS', false) || 'http://localhost:3000',
  };
}

export const env: EnvConfig = validateEnv();

if (!validateCron(env.REMINDER_CRON_SCHEDULE)) {
  throw new Error(`Invalid REMINDER_CRON_SCHEDULE: ${env.REMINDER_CRON_SCHEDULE}`);
}
