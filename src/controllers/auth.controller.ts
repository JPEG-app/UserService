import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async register(req: Request, res: Response) {
    try {
      const user = await this.authService.register(req.body);
      res.status(201).json(user);
    } catch (error: any) {
      if (error.message === 'Email already in use') {
        res.status(400).json({ message: error.message });
      } else {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await this.authService.login(email, password);
      if (!result) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      res.json(result);
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Internal server error during login' });
    }
  }

  async logout(req: Request, res: Response) {
      res.status(204).send();
  }
}