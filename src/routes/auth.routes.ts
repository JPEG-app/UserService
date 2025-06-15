import express from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { StreamService } from '../services/stream.service';
import { UserRepository, initializeUserRepositoryLogger as initUserRepoLoggerAuth } from '../repositories/user.repository';
import { UserService } from '../services/user.service';
import winston from 'winston'; 

const router = express.Router();

export const setupAuthRoutes = (jwtSecret: string, logger: winston.Logger) => {
  initUserRepoLoggerAuth(logger); 

  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_PRIVATE_API_KEY;
  if (!apiKey || !apiSecret) {
    throw new Error("Stream API Key and Secret must be set in .env file");
  }

  const userRepository = new UserRepository(logger);
  const userService = new UserService(userRepository, logger);
  const streamService = new StreamService(apiKey, apiSecret, logger);
  const authService = new AuthService(userService, streamService, jwtSecret, logger);
  const authController = new AuthController(authService, logger);

  router.post('/register', authController.register.bind(authController));
  router.post('/login', authController.login.bind(authController));
  router.post('/logout', authController.logout.bind(authController));

  return router;
};