import { User, UserCreationAttributes } from '../models/user.model';
import { UserService } from './user.service';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import winston from 'winston';

export class AuthService {
  private userService: UserService;
  private jwtSecret: string;
  private logger: winston.Logger;

  constructor(userService: UserService, jwtSecret: string, loggerInstance: winston.Logger) {
    this.userService = userService;
    this.jwtSecret = jwtSecret;
    this.logger = loggerInstance;
  }

  async register(userData: UserCreationAttributes, correlationId?: string): Promise<User> {
    this.logger.info('AuthService: register initiated', { correlationId, email: userData.email, type: 'ServiceLog.register' });
    try {
        const user = await this.userService.createUser(userData, correlationId);
        this.logger.info('AuthService: register successful', { correlationId, userId: user.id, type: 'ServiceLog.registerSuccess' });
        return user;
    } catch (error: any) {
        this.logger.error('AuthService: register failed', { correlationId, email: userData.email, error: error.message, type: 'ServiceError.register' });
        throw error;
    }
  }

  async login(email: string, password: string, correlationId?: string): Promise<{ token: string, userId: string } | null> {
    this.logger.info('AuthService: login attempt', { correlationId, email, type: 'ServiceLog.loginAttempt' });
    const user = await this.userService.findUserByEmail(email, correlationId);
    if (!user || !user.id) {
      this.logger.warn('AuthService: login failed - User not found by email', { correlationId, email, type: 'AuthLog.LoginFail.UserNotFound' });
      return null;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordhash);
    if (!passwordMatch) {
      this.logger.warn('AuthService: login failed - Password mismatch', { correlationId, email, userId: user.id, type: 'AuthLog.LoginFail.PasswordMismatch' });
      return null;
    }

    const token = jwt.sign({ userId: user.id }, this.jwtSecret, { expiresIn: '1h' });
    this.logger.info('AuthService: login successful, token generated', { correlationId, email, userId: user.id, type: 'AuthLog.LoginSuccess.TokenGenerated' });
    return { token, userId: user.id };
  }

  async verifyToken(token: string, correlationId?: string): Promise<{ userId: string } | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      return decoded;
    } catch (error: any) {
      return null;
    }
  }
}