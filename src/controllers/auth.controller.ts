import { Request as ExpressRequest, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { RequestWithId } from '../utils/logger';
import winston from 'winston';

export class AuthController {
  private authService: AuthService;
  private logger: winston.Logger;

  constructor(authService: AuthService, loggerInstance: winston.Logger) {
    this.authService = authService;
    this.logger = loggerInstance;
  }

  async register(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    this.logger.info('AuthController: register initiated', { correlationId, email: req.body.email, type: 'ControllerLog.register' });
    try {
      const { username, email, passwordhash } = req.body;
      if (!username || !email || !passwordhash) {
        this.logger.warn('AuthController: register failed - Missing fields', { correlationId, body: req.body, type: 'AuthLog.RegisterFail.MissingFields' });
        return res.status(400).json({ message: 'Username, email, and passwordhash are required', correlationId });
      }
      const user = await this.authService.register({ username, email, passwordhash }, correlationId);
      this.logger.info('AuthController: register successful', { correlationId, userId: user.id, email: user.email, type: 'AuthLog.RegisterSuccess' });
      res.status(201).json({ id: user.id, username: user.username, email: user.email });
    } catch (error: any) {
      if (error.message.includes('Email already in use') || error.message.includes('provision user')) {
        this.logger.warn('AuthController: register failed', { correlationId, email: req.body.email, error: error.message, type: 'AuthLog.RegisterFail.KnownError' });
        res.status(400).json({ message: error.message, correlationId });
      } else {
        this.logger.error('AuthController: register - Internal server error', { correlationId, email: req.body.email, error: error.message, stack: error.stack, type: 'ControllerError.register' });
        res.status(500).json({ message: 'Internal server error', correlationId });
      }
    }
  }

  async login(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const { email, password } = req.body;
    this.logger.info('AuthController: login attempt', { correlationId, email, type: 'ControllerLog.loginAttempt' });
    try {
      if (!email || !password) {
        this.logger.warn('AuthController: login failed - Missing email or password', { correlationId, email, type: 'AuthLog.LoginFail.MissingFields' });
        return res.status(400).json({ message: 'Email and password are required', correlationId });
      }
      const result = await this.authService.login(email, password, correlationId);
      if (!result) {
        this.logger.warn('AuthController: login failed - Invalid credentials', { correlationId, email, type: 'AuthLog.LoginFail.InvalidCredentials' });
        return res.status(401).json({ message: 'Invalid credentials', correlationId });
      }
      this.logger.info('AuthController: login successful', { correlationId, email, type: 'AuthLog.LoginSuccess' });
      res.json(result);
    } catch (error: any) {
      this.logger.error('AuthController: login - Internal server error', { correlationId, email, error: error.message, stack: error.stack, type: 'ControllerError.login' });
      res.status(500).json({ message: 'Internal server error during login', correlationId });
    }
  }

  async logout(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    this.logger.info('AuthController: logout processed', { correlationId, authUserId: typedReq.userId, type: 'AuthLog.Logout' });
    res.status(204).send();
  }
}