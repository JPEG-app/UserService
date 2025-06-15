import { User, UserCreationAttributes } from '../models/user.model';
import { UserService } from './user.service';
import { StreamService } from './stream.service';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import winston from 'winston';

export class AuthService {
  private userService: UserService;
  private streamService: StreamService;
  private jwtSecret: string;
  private logger: winston.Logger;

  constructor(userService: UserService, streamService: StreamService, jwtSecret: string, loggerInstance: winston.Logger) {
    if (!jwtSecret || jwtSecret.trim() === "") {
      loggerInstance.error('AuthService: JWT_SECRET is undefined or empty.', { type: 'ConfigError.AuthService.NoSecret' });
      throw new Error('JWT_SECRET is undefined or empty for AuthService');
    }
    this.userService = userService;
    this.streamService = streamService;
    this.jwtSecret = jwtSecret;
    this.logger = loggerInstance;
  }

  async register(userData: UserCreationAttributes, correlationId?: string): Promise<User> {
    this.logger.info('AuthService: register initiated', { correlationId, email: userData.email, type: 'ServiceLog.register' });
    try {
        const user = await this.userService.createUser(userData, correlationId);
        
        await this.streamService.createUserInStream({
          id: user.id!.toString(),
          name: user.username
        }, correlationId);

        this.logger.info('AuthService: register successful', { correlationId, userId: user.id, type: 'ServiceLog.registerSuccess' });
        return user;
    } catch (error: any) {
        this.logger.error('AuthService: register failed', { correlationId, email: userData.email, error: error.message, type: 'ServiceError.register' });
        throw error;
    }
  }

  async login(email: string, password: string, correlationId?: string): Promise<{ token: string, userId: string, username: string, streamToken: string } | null> {
    this.logger.info('AuthService: login attempt', { correlationId, email, type: 'ServiceLog.loginAttempt' });
    const user = await this.userService.findUserByEmail(email, correlationId);
    if (!user || !user.id) {
      this.logger.warn('AuthService: login failed - User not found', { correlationId, email, type: 'AuthLog.LoginFail.UserNotFound' });
      return null;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordhash);
    if (!passwordMatch) {
      this.logger.warn('AuthService: login failed - Password mismatch', { correlationId, userId: user.id, type: 'AuthLog.LoginFail.PasswordMismatch' });
      return null;
    }

    const token = jwt.sign({ userId: user.id }, this.jwtSecret, { expiresIn: '1h' });
    const streamToken = this.streamService.createStreamToken(user.id, correlationId);
    
    this.logger.info('AuthService: login successful, tokens generated', { correlationId, userId: user.id, type: 'AuthLog.LoginSuccess.TokensGenerated' });
    
    return { token, userId: user.id, username: user.username, streamToken };
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