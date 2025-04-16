import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { setupUserRoutes } from './routes/user.routes';
import { setupAuthRoutes } from './routes/auth.routes';
import cors from 'cors';

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
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ];

    const corsOptions: cors.CorsOptions = {
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    };
    this.app.use(cors(corsOptions));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
  }

  private routes(): void {
    this.app.use('/auth', setupAuthRoutes(this.jwtSecret));
    this.app.use('/', setupUserRoutes(this.jwtSecret));
  }
}