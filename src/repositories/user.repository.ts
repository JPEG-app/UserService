import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { User, UserCreationAttributes, UserUpdateAttributes } from '../models/user.model';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

export class UserRepository {
  async createUser(user: UserCreationAttributes): Promise<User> {
    try {
      const query = 'INSERT INTO users (username, email, "passwordHash") VALUES ($1, $2, $3) RETURNING *';
      const values = [user.username, user.email, user.passwordHash];
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error creating user:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserById(id: string): Promise<User | undefined> {
    try {
      const query = 'SELECT * FROM users WHERE id = $1';
      const values = [id];
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error finding user by ID:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    try {
      const query = 'SELECT * FROM users WHERE email = $1';
      const values = [email];
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error finding user by email:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async updateUser(id: string, updatedUser: UserUpdateAttributes): Promise<User | undefined> {
    try {
      let query = 'UPDATE users SET ';
      let values: any;
      let paramCount = 1;

      if (updatedUser.username) {
        query += `username = $${paramCount}, `;
        values.push(updatedUser.username);
        paramCount++;
      }
      if (updatedUser.email) {
        query += `email = $${paramCount}, `;
        values.push(updatedUser.email);
        paramCount++;
      }
      if (updatedUser.passwordHash) {
        query += `"passwordHash" = $${paramCount}, `;
        values.push(updatedUser.passwordHash);
        paramCount++;
      }

      query += `updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;
      values.push(id);

      if (values.length > 1) {
        query = query.replace(/, updated_at/, ' updated_at');
      } else {
        return undefined;
      }

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM users WHERE id = $1';
      const values = [id];
      await pool.query(query, values);
      return true;
    } catch (error: any) {
      console.error('Error deleting user:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllUsers(): Promise<User[]> {
    try {
      const query = 'SELECT * FROM users';
      const result = await pool.query(query);
      return result.rows;
    } catch (error: any) {
      console.error('Error finding all users:', error);
      throw new Error('Database error: ' + error.message);
    }
  }
}