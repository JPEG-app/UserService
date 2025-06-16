import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import TestAgent from 'supertest/lib/agent';

jest.mock('../../kafka/producer', () => {
  const mockSend = jest.fn().mockResolvedValue(undefined);
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  const mockDisconnect = jest.fn().mockResolvedValue(undefined);
  const mockProducerInstance = {
    send: mockSend,
    connect: mockConnect,
    disconnect: mockDisconnect,
  };
  return {
    __esModule: true,
    _mockSendFn: mockSend,
    _mockConnectFn: mockConnect,
    _mockDisconnectFn: mockDisconnect,
    getKafkaProducer: jest.fn().mockResolvedValue(mockProducerInstance),
    disconnectProducer: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../../services/stream.service', () => {
  const mockCreateUserInStream = jest.fn().mockResolvedValue(undefined);
  const mockCreateStreamToken = jest.fn().mockReturnValue('mock-stream-token');
  return {
    StreamService: jest.fn().mockImplementation(() => {
      return {
        createUserInStream: mockCreateUserInStream,
        createStreamToken: mockCreateStreamToken,
      };
    }),
    _mockCreateUserInStream: mockCreateUserInStream,
    _mockCreateStreamToken: mockCreateStreamToken,
  };
});

import * as KafkaProducerMock from '../../kafka/producer';
import * as StreamServiceMock from '../../services/stream.service';

dotenv.config({ path: '.env' });

jest.setTimeout(30000);

let appModule: any;
let appInstance: any;
let expressApp: express.Application;
let agent: TestAgent;
let dbPool: Pool;

const TEST_DB_HOST = process.env.DB_HOST_TEST || 'localhost';
const TEST_DB_PORT = parseInt(process.env.DB_PORT_TEST || '6969', 10);
const TEST_DB_USER = process.env.DB_USER_TEST || 'postgres';
const TEST_DB_PASSWORD = process.env.DB_PASSWORD_TEST || 'password';
const TEST_DB_NAME = process.env.DB_NAME_TEST || 'users';
const JWT_SECRET_FOR_TESTS = process.env.TEST_JWT_SECRET || 'a-secure-secret-for-testing';
const STREAM_API_KEY = process.env.STREAM_API_KEY || "dummy-key-for-ci"
const STREAM_PRIVATE_API_KEY = process.env.STREAM_PRIVATE_API_KEY || "dummy-secret-for-ci"

interface UserApiResponse {
  id: string;
  username: string;
  email: string;
  createdAt?: string;
  updatedAt?: string;
}

beforeAll(async () => {
  process.env.DB_HOST = TEST_DB_HOST;
  process.env.DB_PORT = TEST_DB_PORT.toString();
  process.env.DB_USER = TEST_DB_USER;
  process.env.DB_PASSWORD = TEST_DB_PASSWORD;
  process.env.DB_NAME = TEST_DB_NAME;
  process.env.STREAM_API_KEY = STREAM_API_KEY;
  process.env.STREAM_PRIVATE_API_KEY = STREAM_PRIVATE_API_KEY;

  if (!process.env.USER_LIFECYCLE_TOPIC) {
    process.env.USER_LIFECYCLE_TOPIC = 'user_lifecycle_events_test';
  }

  jest.resetModules();

  appModule = await import('../../app');
  appInstance = new appModule.App(JWT_SECRET_FOR_TESTS);
  expressApp = appInstance.app;
  agent = request(expressApp);

  dbPool = new Pool({
    user: TEST_DB_USER,
    host: TEST_DB_HOST,
    database: TEST_DB_NAME,
    password: TEST_DB_PASSWORD,
    port: TEST_DB_PORT,
  });

  try {
    const client = await dbPool.connect();
    client.release();
  } catch (err) {
    console.error('FATAL: Could not connect to the test database.');
    throw err;
  }
});

beforeEach(async () => {
  if (!dbPool) throw new Error("dbPool not initialized.");
  await dbPool.query('DELETE FROM users;');

  (KafkaProducerMock.getKafkaProducer as jest.Mock).mockClear();
  (KafkaProducerMock as any)._mockSendFn.mockClear();
  (KafkaProducerMock.disconnectProducer as jest.Mock).mockClear();
  (StreamServiceMock as any)._mockCreateUserInStream.mockClear();
  (StreamServiceMock as any)._mockCreateStreamToken.mockClear();
});

afterAll(async () => {
  if (dbPool) {
    await dbPool.end();
  }
});

describe('Auth Endpoints - /auth', () => {
  const testUserPayload = {
    username: 'tester',
    email: 'tester@test.com',
    passwordhash: 'password123',
  };

  it('POST /auth/register - should register a new user successfully', async () => {
    const response = await agent.post('/auth/register').send(testUserPayload);

    expect(response.status).toBe(201);
    const body = response.body as UserApiResponse;
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
    expect(body.username).toBe(testUserPayload.username);
    expect(body.email).toBe(testUserPayload.email);
    // expect((StreamServiceMock as any)._mockCreateUserInStream).toHaveBeenCalledTimes(1);
  });

  it('POST /auth/register - should return 400 if email is already in use', async () => {
    await agent.post('/auth/register').send(testUserPayload);
    (StreamServiceMock as any)._mockCreateUserInStream.mockClear();

    const duplicateEmailPayload = { ...testUserPayload, username: 'anotheruser' };
    const response = await agent.post('/auth/register').send(duplicateEmailPayload);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Email already in use');
    expect((StreamServiceMock as any)._mockCreateUserInStream).not.toHaveBeenCalled();
  });

  it('POST /auth/login - should login existing user and return tokens', async () => {
    await agent.post('/auth/register').send(testUserPayload);
    const loginCredentials = {
      email: testUserPayload.email,
      password: testUserPayload.passwordhash,
    };
    const response = await agent.post('/auth/login').send(loginCredentials);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(typeof response.body.token).toBe('string');
    expect(response.body).toHaveProperty('streamToken', 'mock-stream-token');
    expect(response.body).toHaveProperty('username', testUserPayload.username);
    expect(response.body).toHaveProperty('userId');
  });

  it('POST /auth/login - should return 401 for invalid credentials (wrong password)', async () => {
    await agent.post('/auth/register').send(testUserPayload);
    const response = await agent
      .post('/auth/login')
      .send({ email: testUserPayload.email, password: 'wrongpassword' });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid credentials');
  });

  it('POST /auth/logout - should return 204', async () => {
    const response = await agent.post('/auth/logout').send();
    expect(response.status).toBe(204);
  });
});

describe('User Endpoints - /users (Protected)', () => {
  let authToken: string;
  let createdUserForSuite: UserApiResponse;

  const mainUserPayload = {
    username: 'tester',
    email: 'tester@test.com',
    passwordhash: 'password123'
  };

  beforeEach(async () => {
    const registerResponse = await agent.post('/auth/register').send(mainUserPayload);
    expect(registerResponse.status).toBe(201);
    createdUserForSuite = registerResponse.body as UserApiResponse;

    const loginResponse = await agent
      .post('/auth/login')
      .send({ email: mainUserPayload.email, password: mainUserPayload.passwordhash });
    expect(loginResponse.status).toBe(200);
    authToken = loginResponse.body.token;
    (KafkaProducerMock as any)._mockSendFn.mockClear();
  });

  it('GET /users/me - should return details of the authenticated user', async () => {
    const response = await agent
      .get('/users/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);

    const body = response.body as UserApiResponse;
    expect(body.id).toBe(createdUserForSuite.id);
    expect(body.username).toBe(mainUserPayload.username);
  });

  it('GET /users/me - should return 401 if no token is provided', async () => {
    const response = await agent.get('/users/me');
    expect(response.status).toBe(401);
  });

  it('PUT /users/me/password - should update the authenticated user password', async () => {
    const newPassword = 'newStrongerPassword456';
    const response = await agent
      .put('/users/me/password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ newPassword: newPassword });
    expect(response.status).toBe(204);

    const loginAttemptResponse = await agent
      .post('/auth/login')
      .send({ email: mainUserPayload.email, password: newPassword });
    expect(loginAttemptResponse.status).toBe(200);
  });

  it('GET /users - should return a list of users', async () => {
    const response = await agent
      .get('/users')
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const users = response.body as UserApiResponse[];
    const foundUser = users.find(u => u.id === createdUserForSuite.id);
    expect(foundUser).toBeDefined();
  });

  it('PUT /users/:id - should update a user (e.g., username)', async () => {
    const newUsername = 'updatedSuiteUser';
    const response = await agent
      .put(`/users/${createdUserForSuite.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ username: newUsername });

    expect(response.status).toBe(200);
    const body = response.body as UserApiResponse;
    expect(body.username).toBe(newUsername);
    createdUserForSuite.username = newUsername;
  });

  it('DELETE /users/:id - should delete a user', async () => {
    const userToDeletePayload = { username: 'userfordelete', email: 'delete@test.com', passwordhash: 'deleteme' };
    const registerDelResponse = await agent.post('/auth/register').send(userToDeletePayload);
    expect(registerDelResponse.status).toBe(201);
    const userToDelete = registerDelResponse.body as UserApiResponse;

    const response = await agent
      .delete(`/users/${userToDelete.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(204);

    const verifyDeletedResponse = await agent
      .get(`/users/${userToDelete.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(verifyDeletedResponse.status).toBe(404);
  });
});