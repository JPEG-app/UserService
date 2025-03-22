import { User, UserCreationAttributes, UserUpdateAttributes } from '../models/user.model';

const users: User[] = [];

export class UserRepository {
  async createUser(user: UserCreationAttributes): Promise<User> {
    const newUser: User = {
      id: String(users.length + 1),
      ...user,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(newUser);
    return newUser;
  }

  async findUserById(id: string): Promise<User | undefined> {
    return users.find((user) => user.id === id);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    return users.find((user) => user.email === email);
  }

  async findAllUsers(): Promise<User[]> {
    return users;
  }

  async updateUser(id: string, updatedUser: UserUpdateAttributes): Promise<User | undefined> {
    const userIndex = users.findIndex((user) => user.id === id);
    if (userIndex !== -1) {
      users[userIndex] = {
        ...users[userIndex],
        ...updatedUser,
        updatedAt: new Date(),
      };
      return users[userIndex];
    }
    return undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const userIndex = users.findIndex((user) => user.id === id);
    if (userIndex !== -1) {
      users.splice(userIndex, 1);
      return true;
    }
    return false;
  }
}