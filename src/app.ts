import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { setupUserRoutes } from './routes/user.routes';
import { setupAuthRoutes } from './routes/auth.routes';

export class App {
  public app: Application;
  private jwtSecret: string;

  constructor(jwtSecret: string) {
    this.app = express();
    this.jwtSecret = jwtSecret;
    this.config();
    this.routes();
  }

  private config(): void {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
  }

  private routes(): void {
    this.app.use('/auth', setupAuthRoutes(this.jwtSecret));
    this.app.use('/', setupUserRoutes(this.jwtSecret));
  }
}