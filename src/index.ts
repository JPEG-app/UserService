import { App } from './app';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT ;
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error('JWT_SECRET environment variable is not set.');
  process.exit(1);
}

const app = new App(jwtSecret).app;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});