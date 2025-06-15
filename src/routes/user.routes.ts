import express from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { StreamService } from '../services/stream.service';
import { UserRepository, initializeUserRepositoryLogger as initUserRepoLoggerUser } from '../repositories/user.repository';
import winston from 'winston';

const router = express.Router();

export const setupUserRoutes = (jwtSecret: string, logger: winston.Logger) => {
  initUserRepoLoggerUser(logger);

  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_PRIVATE_API_KEY;
  if (!apiKey || !apiSecret) {
    throw new Error("Stream API Key and Secret must be set in .env file");
  }

  const userRepository = new UserRepository(logger);
  const userService = new UserService(userRepository, logger);
  const streamService = new StreamService(apiKey, apiSecret, logger);
  const authService = new AuthService(userService, streamService, jwtSecret, logger); 
  const userController = new UserController(userService, logger);

  const effectiveAuthMiddleware = authMiddleware(authService, logger);

  router.get('/users', effectiveAuthMiddleware, userController.getAllUsers.bind(userController));
  router.get('/users/me', effectiveAuthMiddleware, userController.getMe.bind(userController));
  router.put('/users/me/password', effectiveAuthMiddleware, userController.updateUserPassword.bind(userController));
  router.get('/users/:id', effectiveAuthMiddleware, userController.getUserById.bind(userController));
  router.put('/users/:id', effectiveAuthMiddleware, userController.updateUser.bind(userController));
  router.delete('/users/:id', effectiveAuthMiddleware, userController.deleteUser.bind(userController));

  return router;
};