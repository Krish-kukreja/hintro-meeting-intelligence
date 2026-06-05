import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { errorResponse } from '../utils/response';
import logger from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const traceId = req.traceId || 'unknown';

  // Zod validation errors → 400
  if (err instanceof ZodError) {
    logger.warn('Validation error', {
      traceId,
      path: req.originalUrl,
      issues: err.issues,
    });

    res.status(400).json(
      errorResponse(
        'VALIDATION_ERROR',
        'Request validation failed',
        traceId,
        err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }))
      )
    );
    return;
  }

  // JWT errors → 401
  if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
    const message =
      err instanceof TokenExpiredError
        ? 'Token has expired'
        : 'Invalid or malformed token';

    logger.warn('Authentication error', {
      traceId,
      path: req.originalUrl,
      error: err.message,
    });

    res.status(401).json(
      errorResponse('UNAUTHORIZED', message, traceId)
    );
    return;
  }

  // Prisma known request errors → masked response (no internal schema leakage)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error('Database error', {
      traceId,
      path: req.originalUrl,
      code: err.code,
      meta: err.meta,
    });

    // P2002: Unique constraint violation
    if (err.code === 'P2002') {
      res.status(409).json(
        errorResponse('CONFLICT', 'A record with this value already exists', traceId)
      );
      return;
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      res.status(404).json(
        errorResponse('NOT_FOUND', 'The requested resource was not found', traceId)
      );
      return;
    }

    // All other Prisma errors → generic 500 (never expose internal details)
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', 'A database error occurred', traceId)
    );
    return;
  }

  // Prisma validation errors (malformed queries, etc.)
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error('Prisma validation error', {
      traceId,
      path: req.originalUrl,
      error: err.message,
    });

    res.status(400).json(
      errorResponse('BAD_REQUEST', 'Invalid request data', traceId)
    );
    return;
  }

  // Everything else → 500 (never leak stack traces or internal messages)
  logger.error('Unhandled error', {
    traceId,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json(
    errorResponse(
      'INTERNAL_ERROR',
      'An unexpected error occurred',
      traceId
    )
  );
}
