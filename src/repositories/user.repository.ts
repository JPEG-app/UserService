import { Sequelize, DataTypes, Model, Optional, UniqueConstraintError } from 'sequelize';
import * as dotenv from 'dotenv';
import { User as ExternalUser, UserCreationAttributes as ExternalUserCreationAttributes, UserUpdateAttributes as ExternalUserUpdateAttributes } from '../models/user.model';
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

interface InternalUserAttributes {
  id: number;
  username: string;
  email: string;
  passwordhash: string;
  createdAt: Date;
  updatedAt: Date;
}

interface InternalUserCreationAttributes extends Optional<InternalUserAttributes, 'id' | 'createdAt' | 'updatedAt'> {}


class UserModel extends Model<InternalUserAttributes, InternalUserCreationAttributes> implements InternalUserAttributes {
  public id!: number;
  public username!: string;
  public email!: string;
  public passwordhash!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

UserModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
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
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
        defaultValue: DataTypes.NOW, // Ensures Sequelize provides a value, passing its own notNull validation
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
        defaultValue: DataTypes.NOW, // Ensures Sequelize provides a value, passing its own notNull validation
    }
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true, // Still useful for managing `updatedAt` on updates and general behavior
    createdAt: 'created_at', // Correctly maps to the DB column name
    updatedAt: 'updated_at', // Correctly maps to the DB column name
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

  private toExternalUser(userModelInstance: UserModel): ExternalUser {
    const json = userModelInstance.toJSON() as InternalUserAttributes;
    return {
      ...json,
      id: json.id.toString(),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }

  private toExternalUserOptional(userModelInstance: UserModel | null): ExternalUser | undefined {
    if (!userModelInstance) {
      return undefined;
    }
    return this.toExternalUser(userModelInstance);
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

  async createUser(user: ExternalUserCreationAttributes, correlationId?: string): Promise<ExternalUser> {
    const operation = 'createUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, email: user.email, type: `DBLog.${operation}` });
    try {
      this.logQuery(`UserModel.create`, user, correlationId, operation);
      const newUserInstance = await UserModel.create(user);
      this.logger.info(`UserRepository: ${operation} successful`, { correlationId, userId: newUserInstance.id, type: `DBLog.${operation}Success` });
      return this.toExternalUser(newUserInstance);
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, email: user.email, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      if (error instanceof UniqueConstraintError && error.message.includes('users_email_key')) {
          throw new Error('Email already in use');
      }
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserById(id: string, correlationId?: string): Promise<ExternalUser | undefined> {
    const operation = 'findUserById';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, type: `DBLog.${operation}` });
    try {
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        this.logger.warn(`UserRepository: ${operation} invalid ID format`, { correlationId, userId: id, type: `DBLog.${operation}InvalidIdFormat` });
        return undefined;
      }
      this.logQuery(`UserModel.findByPk`, { id: numericId }, correlationId, operation);
      const userInstance = await UserModel.findByPk(numericId);
      if (userInstance) {
        this.logger.info(`UserRepository: ${operation} found user`, { correlationId, userId: id, type: `DBLog.${operation}Found` });
      } else {
        this.logger.info(`UserRepository: ${operation} user not found`, { correlationId, userId: id, type: `DBLog.${operation}NotFound` });
      }
      return this.toExternalUserOptional(userInstance);
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, userId: id, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findUserByEmail(email: string, correlationId?: string): Promise<ExternalUser | undefined> {
    const operation = 'findUserByEmail';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, email, type: `DBLog.${operation}` });
    try {
      this.logQuery(`UserModel.findOne({ where: { email } })`, { email }, correlationId, operation);
      const userInstance = await UserModel.findOne({ where: { email } });
      if (userInstance) {
        this.logger.info(`UserRepository: ${operation} found user`, { correlationId, email, userId: userInstance.id.toString(), type: `DBLog.${operation}Found` });
      } else {
        this.logger.info(`UserRepository: ${operation} user not found`, { correlationId, email, type: `DBLog.${operation}NotFound` });
      }
      return this.toExternalUserOptional(userInstance);
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, email, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async updateUser(id: string, updatedUser: ExternalUserUpdateAttributes, correlationId?: string): Promise<ExternalUser | undefined> {
    const operation = 'updateUser';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, userId: id, data: updatedUser, type: `DBLog.${operation}` });
    try {
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        this.logger.warn(`UserRepository: ${operation} invalid ID format for update`, { correlationId, userId: id, type: `DBLog.${operation}InvalidIdFormat` });
        return undefined;
      }

      const updateData: Partial<ExternalUserUpdateAttributes> = {};
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

      this.logQuery(`UserModel.update`, { id: numericId, ...updateData }, correlationId, operation);
      // Note: UserModel.update will automatically update the 'updatedAt' field due to `timestamps:true`
      // and the `defaultValue: DataTypes.NOW` on `updatedAt` in the model definition.
      const [numberOfAffectedRows] = await UserModel.update(updateData, {
        where: { id: numericId },
        returning: false, // Explicitly false or rely on default; findByPk fetches fresh data
      });

      // Fetch the updated user to get the new updatedAt value and other potentially modified fields
      // especially if hooks or other database-level changes occurred.
      const userAfterAttempt = await UserModel.findByPk(numericId);


      if (userAfterAttempt) {
        if (numberOfAffectedRows > 0) {
            this.logger.info(`UserRepository: ${operation} successful`, { correlationId, userId: id, type: `DBLog.${operation}Success` });
        } else {
            // This case might occur if the data provided for update matched existing data,
            // resulting in no actual change in the DB, hence 0 affected rows.
            this.logger.info(`UserRepository: ${operation} - user found, but no data fields were modified by the update.`, { correlationId, userId: id, type: `DBLog.${operation}NoActualChange` });
        }
        return this.toExternalUser(userAfterAttempt);
      } else {
        // This case should be rare if an update was attempted on an existing ID,
        // unless the record was deleted between the update call and findByPk.
        this.logger.info(`UserRepository: ${operation} - user not found after update attempt`, { correlationId, userId: id, type: `DBLog.${operation}NotFoundAfterUpdate` });
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
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        this.logger.warn(`UserRepository: ${operation} invalid ID format for delete`, { correlationId, userId: id, type: `DBLog.${operation}InvalidIdFormat` });
        return false;
      }
      this.logQuery(`UserModel.destroy({ where: { id: numericId } })`, { id: numericId }, correlationId, operation);
      const numberOfDeletedRows = await UserModel.destroy({ where: { id: numericId } });
      const success = numberOfDeletedRows > 0;
      this.logger.info(`UserRepository: ${operation} ${success ? 'successful' : 'failed (user not found)'}`, { correlationId, userId: id, success, type: `DBLog.${operation}Result` });
      return success;
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, userId: id, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllUsers(correlationId?: string): Promise<ExternalUser[]> {
    const operation = 'findAllUsers';
    this.logger.info(`UserRepository: ${operation} initiated`, { correlationId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`UserModel.findAll()`, {}, correlationId, operation);
      const users = await UserModel.findAll();
      this.logger.info(`UserRepository: ${operation} found ${users.length} users`, { correlationId, count: users.length, type: `DBLog.${operation}Result` });
      return users.map(userInstance => this.toExternalUser(userInstance));
    } catch (error: any) {
      this.logger.error(`UserRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }
}