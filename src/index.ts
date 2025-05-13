import { App } from './app';
import * as dotenv from 'dotenv';
import { getKafkaProducer, disconnectProducer } from './kafka/producer';

dotenv.config();

const port = process.env.PORT ;
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error('JWT_SECRET environment variable is not set.');
  process.exit(1);
}

const startServer = async () => {
  try {
    await getKafkaProducer();
    console.log('Kafka producer initialized successfully.');

    const appInstance = new App(jwtSecret);
    const expressApp = appInstance.app;

    const server = expressApp.listen(port, () => {
      console.log(`User Service is running on port ${port}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Shutting down gracefully.`);
      server.close(async () => {
        console.log('HTTP server closed.');
        await disconnectProducer();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start User Service or initialize Kafka producer:', error);
    process.exit(1);
  }
};

startServer();