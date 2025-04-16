import { User, UserCreationAttributes } from '../models/user.model';
import { UserRepository } from '../repositories/user.repository';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export class AuthService {
  private userRepository: UserRepository;
  private jwtSecret: string;

  constructor(userRepository: UserRepository, jwtSecret: string) {
    this.userRepository = userRepository;
    this.jwtSecret = jwtSecret;
  }

  async register(user: UserCreationAttributes): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.passwordhash, 10);
    return this.userRepository.createUser({ ...user, passwordhash: hashedPassword });
  }

  async login(email: string, password: string): Promise<{ token: string }> {
    const user = await this.userRepository.findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    console.log("Plain text password:", password);
    console.log("Hashed password from DB:", user.passwordhash);

    const passwordMatch = await bcrypt.compare(password, user.passwordhash);
    if (!passwordMatch) {
      throw new Error('Invalid credentials');
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