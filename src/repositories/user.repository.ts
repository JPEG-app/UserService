import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { User, UserCreationAttributes, UserUpdateAttributes } from '../models/user.model';
import winston from 'winston';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

let repositoryLogger: winston.Logger;

export const initializeUserRepositoryLogger = (loggerInstance: winston.Logger) => {
    repositoryLogger = loggerInstance;
};

export class UserRepository {
  private logger: winston.Logger;

  constructor(loggerInstance?: winston.Logger) {
    this.logger = loggerInstance || repositoryLogger;
    if (!this.logger) {
        console.warn("UserRepository initialized without a logger instance. Falling back to console.");
        this.logger = console as any;
    }
  }

  private logQuery(query: string, values: any[] | undefined, correlationId?: string, operation?: string) {
    this.logger.debug(`UserRepository: Executing DB query`, {
        correlationId,
        operation: operation || 'UnknownUserDBOperation',
        query,
        values: process.env.NODE_ENV !== 'production' ? values : '[values_hidden_in_prod]',
        type: 'DBLog.UserQuery'
    });
  }

  async createUser(user: UserCreationAttributes, correlationId?: string): Promise<User> {
    const operation = 'createUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, email: user.email, type: `DBLog.${operation}` });
    try {
      const query = 'INSERT INTO users (username, email, "passwordhash") VALUES ($1, $2, $3) RETURNING *';
      const values = [user.username, user.email, user.passwordhash];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      this.logger.info(`UserRepository: ${operation} successful`, { correlationId, userId: result.rows[0].id, type: `DBLog.${operation}Success` });
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, email: user.email, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      if (error.message.includes('duplicate key value violates unique constraint "users_email_key"')) {
          throw new Error('Email already in use'); 
      }
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserById(id: string, correlationId?: string): Promise<User | undefined> {
    const operation = 'findUserById';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, type: `DBLog.${operation}` });
    try {
      const query = 'SELECT * FROM users WHERE id = $1';
      const values = [id];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      if (result.rows[0]) {
        this.logger.info(`UserRepository: ${operation} found user`, { correlationId, userId: id, type: `DBLog.${operation}Found` });
      } else {
        this.logger.info(`UserRepository: ${operation} user not found`, { correlationId, userId: id, type: `DBLog.${operation}NotFound` });
      }
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, userId: id, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserByEmail(email: string, correlationId?: string): Promise<User | undefined> {
    const operation = 'findUserByEmail';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, email, type: `DBLog.${operation}` });
    try {
      const query = 'SELECT * FROM users WHERE email = $1';
      const values = [email];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      if (result.rows[0]) {
        this.logger.info(`UserRepository: ${operation} found user`, { correlationId, email, userId: result.rows[0].id, type: `DBLog.${operation}Found` });
      } else {
        this.logger.info(`UserRepository: ${operation} user not found`, { correlationId, email, type: `DBLog.${operation}NotFound` });
      }
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, email, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async updateUser(id: string, updatedUser: UserUpdateAttributes, correlationId?: string): Promise<User | undefined> {
    const operation = 'updateUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, data: updatedUser, type: `DBLog.${operation}` });
    try {
      let setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updatedUser.username !== undefined) {
        setClauses.push(`username = $${paramCount++}`);
        values.push(updatedUser.username);
      }
      if (updatedUser.email !== undefined) {
        setClauses.push(`email = $${paramCount++}`);
        values.push(updatedUser.email);
      }
      if (updatedUser.passwordhash !== undefined) {
        setClauses.push(`"passwordhash" = $${paramCount++}`);
        values.push(updatedUser.passwordhash);
      }

      if (setClauses.length === 0) {
        this.logger.info(`UserRepository: ${operation} - no fields to update, fetching current user.`, { correlationId, userId: id, type: `DBLog.${operation}NoChanges` });
        return this.findUserById(id, correlationId);
      }
      
      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      
      const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      values.push(id);
      this.logQuery(query, values, correlationId, operation);

      const result = await pool.query(query, values);
      if (result.rows[0]) {
        this.logger.info(`UserRepository: ${operation} successful`, { correlationId, userId: id, type: `DBLog.${operation}Success` });
      } else {
        this.logger.info(`UserRepository: ${operation} - user not found for update`, { correlationId, userId: id, type: `DBLog.${operation}NotFoundForUpdate` });
      }
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, userId: id, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      if (error.message.includes('duplicate key value violates unique constraint "users_email_key"')) {
          throw new Error('Email already in use');
      }
      throw new Error('Database error: ' + error.message);
    }
  }

  async deleteUser(id: string, correlationId?: string): Promise<boolean> {
    const operation = 'deleteUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, type: `DBLog.${operation}` });
    try {
      const query = 'DELETE FROM users WHERE id = $1';
      const values = [id];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      const success = result.rowCount !== null && result.rowCount > 0;
      this.logger.info(`UserRepository: ${operation} ${success ? 'successful' : 'failed (user not found)'}`, { correlationId, userId: id, success, type: `DBLog.${operation}Result` });
      return success;
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, userId: id, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllUsers(correlationId?: string): Promise<User[]> {
    const operation = 'findAllUsers';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, type: `DBLog.${operation}` });
    try {
      const query = 'SELECT * FROM users';
      this.logQuery(query, undefined, correlationId, operation);
      const result = await pool.query(query);
      this.logger.info(`UserRepository: ${operation} found ${result.rows.length} users`, { correlationId, count: result.rows.length, type: `DBLog.${operation}Result` });
      return result.rows;
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }
}