import { User, UserCreationAttributes, UserUpdateAttributes } from '../models/user.model';
import { UserRepository } from '../repositories/user.repository';
import bcrypt from 'bcrypt';
import { getKafkaProducer } from '../kafka/producer';
import { ProducerRecord, Message } from 'kafkajs';
import winston from 'winston';

const USER_LIFECYCLE_TOPIC = process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events';

interface UserLifecycleEvent {
  eventType: 'UserCreated' | 'UserDeleted' | 'UserUpdated';
  userId: string;
  username: string;
  email?: string;
  timestamp: string;
}

export class UserService {
  private userRepository: UserRepository;
  private logger: winston.Logger;

  constructor(userRepository: UserRepository, loggerInstance: winston.Logger) {
    this.userRepository = userRepository;
    this.logger = loggerInstance;
  }

  private async sendUserEvent(event: UserLifecycleEvent, correlationId?: string): Promise<void> {
    this.logger.info(`UserService: Attempting to send ${event.eventType} event`, { correlationId, userId: event.userId, topic: USER_LIFECYCLE_TOPIC, type: 'KafkaProducerLog.AttemptSendUserEvent' });
    try {
      const producer = await getKafkaProducer(this.logger, correlationId);
      const messages: Message[] = [{
        value: JSON.stringify(event),
        headers: correlationId ? { 'X-Correlation-ID': correlationId } : undefined,
      }];
      const record: ProducerRecord = {
        topic: USER_LIFECYCLE_TOPIC,
        messages: messages,
      };
      await producer.send(record);
      this.logger.info(`UserService: Sent ${event.eventType} event successfully`, { correlationId, userId: event.userId, topic: USER_LIFECYCLE_TOPIC, type: 'KafkaProducerLog.SentUserEventSuccess' });
    } catch (error: any) {
      this.logger.error(`UserService: Failed to send user event to Kafka`, { correlationId, userId: event.userId, topic: USER_LIFECYCLE_TOPIC, error: error.message, stack: error.stack, type: 'KafkaProducerLog.SendUserEventError' });
    }
  }

  async createUser(userData: UserCreationAttributes, correlationId?: string): Promise<User> {
    this.logger.info('UserService: createUser initiated', { correlationId, email: userData.email, type: 'ServiceLog.createUser' });
    const existingUser = await this.userRepository.findUserByEmail(userData.email, correlationId);
    if (existingUser) {
      this.logger.warn('UserService: createUser failed - Email already in use', { correlationId, email: userData.email, type: 'ServiceValidationWarn.createUserEmailExists' });
      throw new Error('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(userData.passwordhash, 10); 
    this.logger.debug('UserService: Password hashed for new user', { correlationId, email: userData.email, type: 'ServiceLog.createUserPwdHashed' });
    const newUser = await this.userRepository.createUser({ ...userData, passwordhash: hashedPassword }, correlationId);
    this.logger.info('UserService: User created in repository', { correlationId, userId: newUser.id, type: 'ServiceLog.createUserRepoSuccess' });

    if (newUser && newUser.id) {
      await this.sendUserEvent({
        eventType: 'UserCreated',
        userId: newUser.id,
        username: newUser.username,
        email: newUser.email, 
        timestamp: new Date().toISOString(),
      }, correlationId);
    } else {
      this.logger.error("UserService: User created but ID is missing, cannot send Kafka event.", { correlationId, userData: newUser, type: 'ServiceError.createUserMissingIdForEvent' });
    }
    return newUser;
  }

  async findUserById(id: string, correlationId?: string): Promise<User | undefined> {
    this.logger.info('UserService: findUserById initiated', { correlationId, userId: id, type: 'ServiceLog.findUserById' });
    const user = await this.userRepository.findUserById(id, correlationId);
     if (user) {
        this.logger.info('UserService: findUserById successful', { correlationId, userId: id, type: 'ServiceLog.findUserByIdFound' });
    } else {
        this.logger.warn('UserService: findUserById - User not found', { correlationId, userId: id, type: 'ServiceLog.findUserByIdNotFound' });
    }
    return user;
  }

  async findUserByEmail(email: string, correlationId?: string): Promise<User | undefined> {
    this.logger.info('UserService: findUserByEmail initiated', { correlationId, email, type: 'ServiceLog.findUserByEmail' });
    const user = await this.userRepository.findUserByEmail(email, correlationId);
    if (user) {
        this.logger.info('UserService: findUserByEmail successful', { correlationId, email, userId: user.id, type: 'ServiceLog.findUserByEmailFound' });
    } else {
        this.logger.warn('UserService: findUserByEmail - User not found', { correlationId, email, type: 'ServiceLog.findUserByEmailNotFound' });
    }
    return user;
  }

  async findAllUsers(correlationId?: string): Promise<User[]> {
    this.logger.info('UserService: findAllUsers initiated', { correlationId, type: 'ServiceLog.findAllUsers' });
    const users = await this.userRepository.findAllUsers(correlationId);
    this.logger.info(`UserService: findAllUsers found ${users.length} users`, { correlationId, count: users.length, type: 'ServiceLog.findAllUsersResult' });
    return users;
  }

  async updateUser(id: string, updatedUserData: UserUpdateAttributes, correlationId?: string): Promise<User | undefined> {
    this.logger.info('UserService: updateUser initiated', { correlationId, userId: id, data: updatedUserData, type: 'ServiceLog.updateUser' });
    if (updatedUserData.passwordhash) {
      updatedUserData.passwordhash = await bcrypt.hash(updatedUserData.passwordhash, 10);
      this.logger.debug('UserService: Password re-hashed for user update', { correlationId, userId: id, type: 'ServiceLog.updateUserPwdReHashed' });
    }
    const user = await this.userRepository.updateUser(id, updatedUserData, correlationId);
    if (user && user.id && user.username) { 
        this.logger.info('UserService: updateUser successful', { correlationId, userId: id, type: 'ServiceLog.updateUserSuccess' });
        await this.sendUserEvent({
            eventType: 'UserUpdated',
            userId: user.id,
            username: user.username,
            email: user.email, 
            timestamp: new Date().toISOString(),
        }, correlationId);
    } else if (user) {
        this.logger.warn('UserService: updateUser successful but username missing for event', { correlationId, userId: id, type: 'ServiceLog.updateUserSuccessNoEvent' });
    } else {
        this.logger.warn('UserService: updateUser - User not found or no changes made', { correlationId, userId: id, type: 'ServiceLog.updateUserNotFoundOrNoChange' });
    }
    return user;
  }

  async deleteUser(id: string, correlationId?: string): Promise<boolean> {
    this.logger.info('UserService: deleteUser initiated', { correlationId, userId: id, type: 'ServiceLog.deleteUser' });
    const userToDelete = await this.userRepository.findUserById(id, correlationId);
    if (!userToDelete) {
      this.logger.warn('UserService: deleteUser - User not found for deletion', { correlationId, userId: id, type: 'ServiceLog.deleteUserNotFound' });
      return false;
    }
    const success = await this.userRepository.deleteUser(id, correlationId);
    if (success) {
      this.logger.info('UserService: deleteUser successful from repository', { correlationId, userId: id, type: 'ServiceLog.deleteUserRepoSuccess' });
      await this.sendUserEvent({
        eventType: 'UserDeleted',
        userId: id,
        username: userToDelete.username, 
        email: userToDelete.email, 
        timestamp: new Date().toISOString(),
      }, correlationId);
    } else {
        this.logger.error('UserService: deleteUser - Deletion failed in repository after user was found', { correlationId, userId: id, type: 'ServiceError.deleteUserRepoFailAfterFind' });
    }
    return success;
  }

  async updateUserPassword(id: string, newPassword: string, correlationId?: string): Promise<User | undefined> {
    this.logger.info('UserService: updateUserPassword initiated', { correlationId, userId: id, type: 'ServiceLog.updateUserPassword' });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    this.logger.debug('UserService: New password hashed for updateUserPassword', { correlationId, userId: id, type: 'ServiceLog.updateUserPasswordPwdHashed' });
    const user = await this.userRepository.updateUser(id, { passwordhash: hashedPassword }, correlationId);

    if (user && user.id && user.username) {
        this.logger.info('UserService: updateUserPassword successful', { correlationId, userId: id, type: 'ServiceLog.updateUserPasswordSuccess' });
        await this.sendUserEvent({
            eventType: 'UserUpdated',
            userId: user.id,
            username: user.username,
            email: user.email,
            timestamp: new Date().toISOString(),
        }, correlationId);
    } else if (user) {
        this.logger.warn('UserService: updateUserPassword successful but username missing for event', { correlationId, userId: id, type: 'ServiceLog.updateUserPasswordSuccessNoEvent' });
    } else {
        this.logger.warn('UserService: updateUserPassword - User not found for password update', { correlationId, userId: id, type: 'ServiceLog.updateUserPasswordUserNotFound' });
    }
    return user;
  }
}