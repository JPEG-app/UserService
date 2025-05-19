import express, { Application, Request as ExpressRequest, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupUserRoutes } from './routes/user.routes';
import { setupAuthRoutes } from './routes/auth.routes';
import logger, { assignRequestId, requestLogger, logError, RequestWithId } from './utils/logger';

export class App {
  public app: Application;
  private jwtSecret: string;

  constructor(jwtSecret: string) {
    this.app = express();
    this.jwtSecret = jwtSecret;
    this.config();
    this.routes();
    this.errorHandling();
  }

  private config(): void {
    this.app.use(assignRequestId);

    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ];

    const corsOptions: cors.CorsOptions = {
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('CORS blocked request', { origin, type: 'CorsErrorLog' });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    };
    this.app.use(cors(corsOptions));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(requestLogger);
  }

  private routes(): void {
    this.app.use('/auth', setupAuthRoutes(this.jwtSecret, logger));
    this.app.use('/', setupUserRoutes(this.jwtSecret, logger));
  }

  private errorHandling(): void {
    this.app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
      const err: any = new Error('Not Found');
      err.status = 404;
      next(err);
    });

    this.app.use((err: any, req: ExpressRequest, res: Response, next: NextFunction) => {
      const typedReq = req as RequestWithId;
      logError(err, req, 'Unhandled error in Express request lifecycle');
      res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        correlationId: typedReq.id,
        ...(typedReq.userId && { authUserId: typedReq.userId }),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    });
  }
}