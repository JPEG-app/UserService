import { User, UserCreationAttributes, UserUpdateAttributes } from '../models/user.model';
import { UserRepository } from '../repositories/user.repository';
import bcrypt from 'bcrypt';

export class UserService {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async createUser(user: UserCreationAttributes): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.passwordhash, 10); // Hash the password
    return this.userRepository.createUser({ ...user, passwordhash: hashedPassword });
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
    return this.userRepository.updateUser(id, updatedUser);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.userRepository.deleteUser(id);
  }

  async updateUserPassword(id: string, newPassword: string): Promise<User | undefined> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return this.userRepository.updateUser(id, { passwordhash: hashedPassword });
  }
}