import { User, UserCreationAttributes, UserUpdateAttributes } from '../models/user.model';
import { UserRepository } from '../repositories/user.repository';
import bcrypt from 'bcrypt';
import { getKafkaProducer } from '../kafka/producer';
import { ProducerRecord } from 'kafkajs';

const USER_LIFECYCLE_TOPIC = process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events';

interface UserLifecycleEvent {
  eventType: 'UserCreated' | 'UserDeleted' | 'UserUpdated';
  userId: string;
  timestamp: string;
}

export class UserService {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  private async sendUserEvent(event: UserLifecycleEvent): Promise<void> {
    try {
      const producer = await getKafkaProducer();
      const record: ProducerRecord = {
        topic: USER_LIFECYCLE_TOPIC,
        messages: [{ value: JSON.stringify(event) }],
      };
      await producer.send(record);
      console.log(`Sent ${event.eventType} event for userId ${event.userId} to Kafka topic ${USER_LIFECYCLE_TOPIC}`);
    } catch (error) {
      console.error(`Failed to send user event to Kafka for userId ${event.userId}:`, error);
    }
  }

  async createUser(userData: UserCreationAttributes): Promise<User> {
    const existingUser = await this.userRepository.findUserByEmail(userData.email);
    if (existingUser) {
      throw new Error('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(userData.passwordhash, 10);
    const newUser = await this.userRepository.createUser({ ...userData, passwordhash: hashedPassword });

    if (newUser && newUser.id) {
      await this.sendUserEvent({
        eventType: 'UserCreated',
        userId: newUser.id,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error("User created but ID is missing, cannot send Kafka event.");
    }
    return newUser;
  }

  async findUserById(id: string): Promise<User | undefined> {
    return this.userRepository.findUserById(id);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    return this.userRepository.findUserByEmail(email);
  }

  async findAllUsers(): Promise<User[]> {
    return this.userRepository.findAllUsers();
  }

  async updateUser(id: string, updatedUser: UserUpdateAttributes): Promise<User | undefined> {
    if (updatedUser.passwordhash) {
      updatedUser.passwordhash = await bcrypt.hash(updatedUser.passwordhash, 10);
    }
    const user = await this.userRepository.updateUser(id, updatedUser);
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const success = await this.userRepository.deleteUser(id);
    if (success) {
      await this.sendUserEvent({
        eventType: 'UserDeleted',
        userId: id,
        timestamp: new Date().toISOString(),
      });
    }
    return success;
  }

  async updateUserPassword(id: string, newPassword: string): Promise<User | undefined> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await this.userRepository.updateUser(id, { passwordhash: hashedPassword });
    return user;
  }
}