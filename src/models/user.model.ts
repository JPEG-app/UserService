export interface User {
  id?: string;
  username: string;
  email: string;
  passwordhash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserCreationAttributes {
  username: string;
  email: string;
  passwordhash: string;
}

export interface UserUpdateAttributes {
  username?: string;
  email?: string;
  passwordhash?: string;
}