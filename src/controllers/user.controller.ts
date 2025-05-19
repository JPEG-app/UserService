import { Request as ExpressRequest, Response } from 'express';
import { UserService } from '../services/user.service';
import { RequestWithId } from '../utils/logger';
import winston from 'winston';

export class UserController {
  private userService: UserService;
  private logger: winston.Logger;

  constructor(userService: UserService, loggerInstance: winston.Logger) {
    this.userService = userService;
    this.logger = loggerInstance;
  }

  async getUserById(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const targetUserId = req.params.id;
    this.logger.info('UserController: getUserById initiated', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerLog.getUserById' });
    try {
      const user = await this.userService.findUserById(targetUserId, correlationId);
      if (user) {
        this.logger.info('UserController: getUserById successful', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerLog.getUserByIdFound' });
        res.json(user);
      } else {
        this.logger.warn('UserController: getUserById - User not found', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerNotFound.getUserById' });
        res.status(404).json({ message: 'User not found', correlationId });
      }
    } catch (error: any) {
      this.logger.error('UserController: getUserById - Internal server error', { correlationId, targetUserId, authUserId: typedReq.userId, error: error.message, stack: error.stack, type: 'ControllerError.getUserById' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async getAllUsers(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    this.logger.info('UserController: getAllUsers initiated', { correlationId, authUserId: typedReq.userId, type: 'ControllerLog.getAllUsers' });
    try {
      const users = await this.userService.findAllUsers(correlationId);
      this.logger.info(`UserController: getAllUsers successful, found ${users.length} users`, { correlationId, authUserId: typedReq.userId, count: users.length, type: 'ControllerLog.getAllUsersResult' });
      res.json(users);
    } catch (error: any) {
      this.logger.error('UserController: getAllUsers - Internal server error', { correlationId, authUserId: typedReq.userId, error: error.message, stack: error.stack, type: 'ControllerError.getAllUsers' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async updateUser(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const targetUserId = req.params.id;
    this.logger.info('UserController: updateUser initiated', { correlationId, targetUserId, authUserId: typedReq.userId, body: req.body, type: 'ControllerLog.updateUser' });
    try {
      const updatedUser = await this.userService.updateUser(targetUserId, req.body, correlationId);
      if (updatedUser) {
        this.logger.info('UserController: updateUser successful', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerLog.updateUserSuccess' });
        res.json(updatedUser);
      } else {
        this.logger.warn('UserController: updateUser - User not found', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerNotFound.updateUser' });
        res.status(404).json({ message: 'User not found', correlationId });
      }
    } catch (error: any) {
      this.logger.error('UserController: updateUser - Internal server error', { correlationId, targetUserId, authUserId: typedReq.userId, error: error.message, stack: error.stack, type: 'ControllerError.updateUser' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async deleteUser(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const targetUserId = req.params.id;
    this.logger.info('UserController: deleteUser initiated', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerLog.deleteUser' });
    try {
      const deleted = await this.userService.deleteUser(targetUserId, correlationId);
      if (deleted) {
        this.logger.info('UserController: deleteUser successful', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerLog.deleteUserSuccess' });
        res.status(204).send();
      } else {
        this.logger.warn('UserController: deleteUser - User not found', { correlationId, targetUserId, authUserId: typedReq.userId, type: 'ControllerNotFound.deleteUser' });
        res.status(404).json({ message: 'User not found', correlationId });
      }
    } catch (error: any) {
      this.logger.error('UserController: deleteUser - Internal server error', { correlationId, targetUserId, authUserId: typedReq.userId, error: error.message, stack: error.stack, type: 'ControllerError.deleteUser' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async getMe(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authUserId = typedReq.userId; 
    this.logger.info('UserController: getMe initiated', { correlationId, authUserId, type: 'ControllerLog.getMe' });
    try {
        if (!authUserId) { 
            this.logger.error('UserController: getMe - authUserId missing from request after authMiddleware', { correlationId, type: 'ControllerAuthError.getMeMissingUserId' });
            return res.status(401).json({ message: 'Unauthorized, user ID missing.', correlationId });
        }
        const user = await this.userService.findUserById(authUserId, correlationId);
        if (user){
            this.logger.info('UserController: getMe successful', { correlationId, authUserId, type: 'ControllerLog.getMeSuccess' });
            res.json(user);
        } else {
            this.logger.warn('UserController: getMe - Authenticated user not found in DB', { correlationId, authUserId, type: 'ControllerAuthError.getMeUserNotFoundInDB' });
            res.status(404).json({message: "User not found", correlationId});
        }
    } catch (error: any) {
        this.logger.error('UserController: getMe - Internal server error', { correlationId, authUserId, error: error.message, stack: error.stack, type: 'ControllerError.getMe' });
        res.status(500).json({message: "Internal server error", correlationId});
    }
  }

  async updateUserPassword(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authUserId = typedReq.userId;
    this.logger.info('UserController: updateUserPassword initiated', { correlationId, authUserId, type: 'ControllerLog.updateUserPassword' });
    try {
      if (!authUserId) {
          this.logger.error('UserController: updateUserPassword - authUserId missing', { correlationId, type: 'ControllerAuthError.updateUserPasswordMissingUserId' });
          return res.status(401).json({ message: 'Unauthorized, user ID missing.', correlationId });
      }
      const updatedUser = await this.userService.updateUserPassword(authUserId, req.body.newPassword, correlationId);
      if (updatedUser){
          this.logger.info('UserController: updateUserPassword successful', { correlationId, authUserId, type: 'ControllerLog.updateUserPasswordSuccess' });
          res.status(204).send();
      } else {
          this.logger.warn('UserController: updateUserPassword - User not found for update (unexpected)', { correlationId, authUserId, type: 'ControllerError.updateUserPasswordUserNotFound' });
          res.status(404).json({message: "User not found", correlationId});
      }
    } catch (error: any) {
      this.logger.error('UserController: updateUserPassword - Internal server error', { correlationId, authUserId, error: error.message, stack: error.stack, type: 'ControllerError.updateUserPassword' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }
}