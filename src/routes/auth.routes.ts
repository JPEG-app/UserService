import express from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { UserRepository, initializeUserRepositoryLogger as initUserRepoLoggerAuth } from '../repositories/user.repository';
import { UserService } from '../services/user.service';
import winston from 'winston'; 

const router = express.Router();

export const setupAuthRoutes = (jwtSecret: string, logger: winston.Logger) => {
  initUserRepoLoggerAuth(logger); 

  const userRepository = new UserRepository(logger);
  const userService = new UserService(userRepository, logger);
  const authService = new AuthService(userService, jwtSecret, logger);
  const authController = new AuthController(authService, logger);

  router.post('/register', authController.register.bind(authController));
  router.post('/login', authController.login.bind(authController));
  router.post('/logout', authController.logout.bind(authController));

  return router;
};