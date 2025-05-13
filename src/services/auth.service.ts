import { User, UserCreationAttributes } from '../models/user.model';
import { UserService } from './user.service'; // Import UserService
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export class AuthService {
  private userService: UserService;
  private jwtSecret: string;

  constructor(userService: UserService, jwtSecret: string) {
    this.userService = userService;
    this.jwtSecret = jwtSecret;
  }

  async register(userData: UserCreationAttributes): Promise<User> {
    return this.userService.createUser(userData);
  }

  async login(email: string, password: string): Promise<{ token: string } | null> {
    const user = await this.userService.findUserByEmail(email);
    if (!user || !user.id) {
      return null;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordhash);
    if (!passwordMatch) {
      return null;
    }

    const token = jwt.sign({ userId: user.id }, this.jwtSecret, { expiresIn: '1h' });
    return { token };
  }

  async verifyToken(token: string): Promise<{ userId: string } | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      return decoded;
    } catch (error) {
      return null;
    }
  }
}