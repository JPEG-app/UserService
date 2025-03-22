import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  async getUserById(req: Request, res: Response) {
    try {
      const user = await this.userService.findUserById(req.params.id);
      if (user) {
        res.json(user);
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getAllUsers(req: Request, res: Response) {
    try {
      const users = await this.userService.findAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateUser(req: Request, res: Response) {
    try {
      const updatedUser = await this.userService.updateUser(req.params.id, req.body);
      if (updatedUser) {
        res.json(updatedUser);
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deleteUser(req: Request, res: Response) {
    try {
      const deleted = await this.userService.deleteUser(req.params.id);
      if (deleted) {
        res.status(204).send(); // No content
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getMe(req: Request, res: Response) {
      try {
          const user = await this.userService.findUserById((req as any).userId);
          if (user){
              res.json(user);
          } else {
              res.status(404).json({message: "user not found"});
          }
      } catch (error) {
          res.status(500).json({message: "internal server error"});
      }

  }

  async updateUserPassword(req: Request, res: Response) {
    try {
      const updatedUser = await this.userService.updateUserPassword((req as any).userId, req.body.newPassword);
      if (updatedUser){
          res.status(204).send();
      } else {
          res.status(404).json({message: "User not found"});
      }

    } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}