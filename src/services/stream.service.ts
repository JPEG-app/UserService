import { StreamChat } from 'stream-chat';
import winston from 'winston';

export class StreamService {
  private streamChat: StreamChat;
  private logger: winston.Logger;

  constructor(apiKey: string, apiSecret: string, loggerInstance: winston.Logger) {
    if (!apiKey || !apiSecret) {
      loggerInstance.error('StreamService: API Key or Secret is missing.', { type: 'ConfigError.StreamService.NoKeys' });
      throw new Error('STREAM_API_KEY and STREAM_PRIVATE_API_KEY must be provided');
    }
    this.streamChat = new StreamChat(apiKey, apiSecret);
    this.logger = loggerInstance;
  }

  async createUserInStream(user: { id: string; name: string; image?: string }, correlationId?: string): Promise<void> {
    this.logger.info('StreamService: Creating user in Stream Chat', { correlationId, userId: user.id, type: 'StreamLog.createUser' });
    try {
      const existingUsers = await this.streamChat.queryUsers({ id: user.id });
      if (existingUsers.users.length > 0) {
        this.logger.warn('StreamService: User already exists, updating instead.', { correlationId, userId: user.id, type: 'StreamLog.userExists' });
      }
      await this.streamChat.upsertUser({ id: user.id, name: user.name, image: user.image });
      this.logger.info('StreamService: User successfully created/updated in Stream Chat', { correlationId, userId: user.id, type: 'StreamLog.createUserSuccess' });
    } catch (error: any) {
      this.logger.error('StreamService: Failed to create user in Stream Chat', { correlationId, userId: user.id, error: error.message, type: 'StreamError.createUser' });
      throw new Error('Failed to provision user in chat service.');
    }
  }

  createStreamToken(userId: string, correlationId?: string): string {
    this.logger.info('StreamService: Creating Stream token', { correlationId, userId, type: 'StreamLog.createToken' });
    return this.streamChat.createToken(userId);
  }
}