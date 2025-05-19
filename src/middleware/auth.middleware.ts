import { Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { RequestWithId } from '../utils/logger'; 
import winston from 'winston';

export function authMiddleware(authService: AuthService, logger: winston.Logger) {
  return async (req: RequestWithId, res: Response, next: NextFunction) => {
    const correlationId = req.id; 
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('AuthMiddleware: Unauthorized - Missing or malformed Bearer token', { correlationId, url: req.originalUrl, type: 'AuthMiddleware.Fail.NoToken' });
      return res.status(401).json({ message: 'Unauthorized', correlationId });
    }

    const token = authHeader.split(' ')[1];
    const decoded = await authService.verifyToken(token, correlationId); 

    if (!decoded || !decoded.userId) {
      logger.warn('AuthMiddleware: Unauthorized - Invalid token', { correlationId, url: req.originalUrl, type: 'AuthMiddleware.Fail.InvalidToken' });
      return res.status(401).json({ message: 'Unauthorized', correlationId });
    }

    req.userId = decoded.userId; 
    logger.info('AuthMiddleware: Authorized successfully', { correlationId, authUserId: req.userId, url: req.originalUrl, type: 'AuthMiddleware.Success' });
    next();
  };
}