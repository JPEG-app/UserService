import express from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';

const router = express.Router();

export const setupUserRoutes = (jwtSecret: string) => {
  const userRepository = new UserRepository();
  const userService = new UserService(userRepository);
  const authService = new AuthService(userService, jwtSecret);
  const userController = new UserController(userService);

  router.get('/users', authMiddleware(authService), userController.getAllUsers.bind(userController));
  router.get('/users/me', authMiddleware(authService), userController.getMe.bind(userController));
  router.put('/users/me/password', authMiddleware(authService), userController.updateUserPassword.bind(userController));
  router.get('/users/:id', authMiddleware(authService), userController.getUserById.bind(userController));
  router.put('/users/:id', authMiddleware(authService), userController.updateUser.bind(userController));
  router.delete('/users/:id', authMiddleware(authService), userController.deleteUser.bind(userController));

  return router;
};