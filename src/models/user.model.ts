export interface User {
    id?: string;
    username: string;
    email: string;
    passwordHash: string;
    createdAt?: Date;
    updatedAt?: Date;
  }
  
export interface UserCreationAttributes {
  username: string;
  email: string;
  passwordHash: string;
}

export interface UserUpdateAttributes {
  username?: string;
  email?: string;
  passwordHash?: string;
}