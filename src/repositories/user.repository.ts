import { Sequelize, DataTypes, Model, Optional, UniqueConstraintError } from 'sequelize';
import * as dotenv from 'dotenv';
import { User, UserCreationAttributes, UserUpdateAttributes } from '../models/user.model';
import winston from 'winston';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME!,
  process.env.DB_USER!,
  process.env.DB_PASSWORD!,
  {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '5432'),
    dialect: 'postgres',
    logging: false,
  }
);

class UserModel extends Model<User, UserCreationAttributes> implements User {
  public id!: string;
  public username!: string;
  public email!: string;
  public passwordhash!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

UserModel.init(
  {
    id: {
      type: DataTypes.STRING,
      defaultValue: DataTypes.STRING,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: 'users_email_key',
    },
    passwordhash: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'passwordhash', 
    }
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

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

  private logQuery(queryDesc: string, values: any, correlationId?: string, operation?: string) {
    this.logger.debug(`UserRepository: Executing DB operation`, {
        correlationId,
        operation: operation || 'UnknownUserDBOperation',
        details: queryDesc,
        params: process.env.NODE_ENV !== 'production' ? values : '[values_hidden_in_prod]',
        type: 'DBLog.UserQuery'
    });
  }

  async createUser(user: UserCreationAttributes, correlationId?: string): Promise<User> {
    const operation = 'createUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, email: user.email, type: `DBLog.${operation}` });
    try {
      this.logQuery(`UserModel.create`, user, correlationId, operation);
      const newUser = await UserModel.create(user);
      this.logger.info(`UserRepository: ${operation} successful`, { correlationId, userId: newUser.id, type: `DBLog.${operation}Success` });
      return newUser.toJSON() as User;
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, email: user.email, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      if (error instanceof UniqueConstraintError && error.message.includes('users_email_key')) {
          throw new Error('Email already in use'); 
      }
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserById(id: string, correlationId?: string): Promise<User | undefined> {
    const operation = 'findUserById';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, type: `DBLog.${operation}` });
    try {
      this.logQuery(`UserModel.findByPk`, { id }, correlationId, operation);
      const userInstance = await UserModel.findByPk(id);
      if (userInstance) {
        this.logger.info(`UserRepository: ${operation} found user`, { correlationId, userId: id, type: `DBLog.${operation}Found` });
        return userInstance.toJSON() as User;
      } else {
        this.logger.info(`UserRepository: ${operation} user not found`, { correlationId, userId: id, type: `DBLog.${operation}NotFound` });
        return undefined;
      }
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, userId: id, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserByEmail(email: string, correlationId?: string): Promise<User | undefined> {
    const operation = 'findUserByEmail';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, email, type: `DBLog.${operation}` });
    try {
      this.logQuery(`UserModel.findOne({ where: { email } })`, { email }, correlationId, operation);
      const userInstance = await UserModel.findOne({ where: { email } });
      if (userInstance) {
        this.logger.info(`UserRepository: ${operation} found user`, { correlationId, email, userId: userInstance.id, type: `DBLog.${operation}Found` });
        return userInstance.toJSON() as User;
      } else {
        this.logger.info(`UserRepository: ${operation} user not found`, { correlationId, email, type: `DBLog.${operation}NotFound` });
        return undefined;
      }
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, email, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async updateUser(id: string, updatedUser: UserUpdateAttributes, correlationId?: string): Promise<User | undefined> {
    const operation = 'updateUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, data: updatedUser, type: `DBLog.${operation}` });
    try {
      const updateData: Partial<UserUpdateAttributes> = {};
      let hasUpdates = false;
      if (updatedUser.username !== undefined) {
        updateData.username = updatedUser.username;
        hasUpdates = true;
      }
      if (updatedUser.email !== undefined) {
        updateData.email = updatedUser.email;
        hasUpdates = true;
      }
      if (updatedUser.passwordhash !== undefined) {
        updateData.passwordhash = updatedUser.passwordhash;
        hasUpdates = true;
      }

      if (!hasUpdates) {
        this.logger.info(`UserRepository: ${operation} - no fields to update, fetching current user.`, { correlationId, userId: id, type: `DBLog.${operation}NoChanges` });
        return this.findUserById(id, correlationId);
      }
      
      this.logQuery(`UserModel.update`, { id, ...updateData }, correlationId, operation);
      const [numberOfAffectedRows] = await UserModel.update(updateData, {
        where: { id },
      });

      const userAfterAttempt = await UserModel.findByPk(id);

      if (userAfterAttempt) {
        if (numberOfAffectedRows > 0) {
            this.logger.info(`UserRepository: ${operation} successful`, { correlationId, userId: id, type: `DBLog.${operation}Success` });
        } else {
            this.logger.info(`UserRepository: ${operation} - user found, but no data fields were modified by the update.`, { correlationId, userId: id, type: `DBLog.${operation}NoActualChange` });
        }
        return userAfterAttempt.toJSON() as User;
      } else {
        this.logger.info(`UserRepository: ${operation} - user not found for update`, { correlationId, userId: id, type: `DBLog.${operation}NotFoundForUpdate` });
        return undefined;
      }
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, userId: id, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      if (error instanceof UniqueConstraintError && error.message.includes('users_email_key')) {
          throw new Error('Email already in use');
      }
      throw new Error('Database error: ' + error.message);
    }
  }

  async deleteUser(id: string, correlationId?: string): Promise<boolean> {
    const operation = 'deleteUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, type: `DBLog.${operation}` });
    try {
      this.logQuery(`UserModel.destroy({ where: { id } })`, { id }, correlationId, operation);
      const numberOfDeletedRows = await UserModel.destroy({ where: { id } });
      const success = numberOfDeletedRows > 0;
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
      this.logQuery(`UserModel.findAll()`, {}, correlationId, operation);
      const users = await UserModel.findAll();
      this.logger.info(`UserRepository: ${operation} found ${users.length} users`, { correlationId, count: users.length, type: `DBLog.${operation}Result` });
      return users.map(user => user.toJSON() as User);
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }
}