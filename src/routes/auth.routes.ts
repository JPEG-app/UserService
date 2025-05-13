import express from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';
import { UserService } from '../services/user.service';

const router = express.Router();

export const setupAuthRoutes = (jwtSecret: string) => {
  const userRepository = new UserRepository();
  const userService = new UserService(userRepository);
  const authService = new AuthService(userService, jwtSecret);
  const authController = new AuthController(authService);

  router.post('/register', authController.register.bind(authController));
  router.post('/login', authController.login.bind(authController));
  router.post('/logout', authController.logout.bind(authController));

  return router;
};