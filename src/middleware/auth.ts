import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { errorResponse } from '../utils/response';
import logger from '../utils/logger';

interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or malformed Authorization header', {
      traceId: req.traceId,
      path: req.originalUrl,
    });

    res.status(401).json(
      errorResponse('UNAUTHORIZED', 'Missing or malformed Authorization header', req.traceId)
    );
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    req.userId = decoded.userId;
    next();
  } catch (err) {
    next(err);
  }
}
