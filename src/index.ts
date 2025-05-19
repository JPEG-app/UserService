import { App } from './app';
import * as dotenv from 'dotenv';
import { getKafkaProducer, disconnectProducer, initializeKafkaProducerLogger } from './kafka/producer';
import logger from './utils/logger'; 

dotenv.config();

const port = process.env.PORT || 3000; 
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  logger.error('JWT_SECRET environment variable is not set.', { type: 'StartupLog.FatalConfigError' });
  process.exit(1);
}

const startServer = async () => {
  logger.info('User Service starting...', { type: 'StartupLog.Init' });
  try {
    initializeKafkaProducerLogger(logger); 
    await getKafkaProducer(logger); 
    logger.info('Kafka producer initialized successfully.', { type: 'StartupLog.KafkaProducerReady' });

    const appInstance = new App(jwtSecret);
    const expressApp = appInstance.app;

    const server = expressApp.listen(port, () => {
      logger.info(`User Service is running on port ${port}`, { port, type: 'StartupLog.HttpReady' });
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down User Service gracefully.`, { signal, type: 'ShutdownLog.SignalReceived' });
      server.close(async (err?: Error) => {
        if (err) {
            logger.error('Error during HTTP server close:', { error: err.message, stack: err.stack, type: 'ShutdownLog.HttpCloseError'});
        } else {
            logger.info('HTTP server closed.', { type: 'ShutdownLog.HttpClosed' });
        }
        await disconnectProducer(); 
        logger.info('Kafka producer stopped.', { type: 'ShutdownLog.KafkaProducerStopped' });
        process.exit(err ? 1 : 0);
      });

      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down', { timeout: 10000, type: 'ShutdownLog.ForceExit' });
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
        logger.error('Unhandled synchronous error (uncaughtException):', { error: error.message, stack: error.stack, type: 'FatalErrorLog.UncaughtException' });
        disconnectProducer().finally(() => process.exit(1));
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled promise rejection:', { reason, type: 'FatalErrorLog.UnhandledRejection' });
    });

  } catch (error: any) {
    logger.error('Failed to start User Service or initialize Kafka producer.', { error: error.message, stack: error.stack, type: 'StartupLog.FatalError' });
    await disconnectProducer().catch(e => logger.error("Error stopping producer during failed startup", { error: (e as Error).message, type: 'ShutdownLog.ProducerFailStop'}));
    process.exit(1);
  }
};

startServer();