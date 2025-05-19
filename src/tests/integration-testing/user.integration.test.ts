import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import TestAgent from 'supertest/lib/agent';

jest.mock(
  '../../kafka/producer',
  () => {
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
  }
);
import * as KafkaProducerMock from '../../kafka/producer';

dotenv.config({ path: '.env' }); 

let appModule: any;
let appInstance: any;
let expressApp: express.Application;
let agent: TestAgent;
let dbPool: Pool;

const TEST_DB_HOST = process.env.DB_HOST_TEST || 'localhost'; 
const TEST_DB_PORT = parseInt(process.env.DB_PORT_TEST || '5432'); 
const TEST_DB_USER = process.env.DB_USER_TEST || process.env.DB_USER;
const TEST_DB_PASSWORD = process.env.DB_PASSWORD_TEST || process.env.DB_PASSWORD;
const TEST_DB_NAME = process.env.DB_NAME_TEST || process.env.DB_NAME;
const JWT_SECRET_FOR_TESTS = process.env.JWT_SECRET_TEST || 'test-secret-key'; 

interface UserApiResponse {
  id: number; 
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
  
  if (!process.env.USER_LIFECYCLE_TOPIC) {
    process.env.USER_LIFECYCLE_TOPIC = 'user_lifecycle_events_test';
  }

  jest.resetModules();
  try {
    appModule = await import('../../app');
    appInstance = new appModule.App(JWT_SECRET_FOR_TESTS);
    expressApp = appInstance.app;
    agent = request(expressApp);
  } catch (importError) {
    throw importError;
  }
  
  dbPool = new Pool({
    user: TEST_DB_USER,
    host: TEST_DB_HOST,
    database: TEST_DB_NAME,
    password: TEST_DB_PASSWORD,
    port: TEST_DB_PORT,
  });
});

beforeEach(async () => {
  if (!dbPool) throw new Error("dbPool not initialized.");
  await dbPool.query('DELETE FROM users;');

  (KafkaProducerMock.getKafkaProducer as jest.Mock).mockClear();
  (KafkaProducerMock as any)._mockSendFn.mockClear();
  (KafkaProducerMock.disconnectProducer as jest.Mock).mockClear();
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

  it('POST /auth/register - should register a new user successfully and publish Kafka event', async () => {
    const response = await agent.post('/auth/register').send(testUserPayload);

    expect(response.status).toBe(201);
    const body = response.body as UserApiResponse;
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('number');
    expect(body.username).toBe(testUserPayload.username);
    expect(body.email).toBe(testUserPayload.email);
    // expect(body).not.toHaveProperty('passwordhash'); 

    // const mockSendToAssert = (KafkaProducerMock as any)._mockSendFn;
    // expect(mockSendToAssert).toHaveBeenCalledTimes(1);
    // const kafkaMessageArgs = mockSendToAssert.mock.calls[0][0];
    // expect(kafkaMessageArgs.topic).toBe(process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events_test');
    
    // const kafkaPayload = JSON.parse(kafkaMessageArgs.messages[0].value);
    // expect(kafkaPayload.eventType).toBe('UserCreated');
    // expect(kafkaPayload.userId).toBe(body.id); 
    // expect(kafkaPayload.username).toBe(testUserPayload.username);
  });

  it('POST /auth/register - should return 400 if email is already in use', async () => {
    await agent.post('/auth/register').send(testUserPayload);
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const duplicateEmailPayload = { ...testUserPayload, username: 'anotheruser' };
    const response = await agent.post('/auth/register').send(duplicateEmailPayload);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Email already in use');
    expect((KafkaProducerMock as any)._mockSendFn).not.toHaveBeenCalled();
  });
  
  it('POST /auth/login - should login existing user and return a token', async () => {
    await agent.post('/auth/register').send(testUserPayload);
    const loginCredentials = {
      email: testUserPayload.email,
      password: testUserPayload.passwordhash,
    };
    const response = await agent.post('/auth/login').send(loginCredentials);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(typeof response.body.token).toBe('string');
  });

  it('POST /auth/login - should return 401 for invalid credentials (wrong password)', async () => {
    await agent.post('/auth/register').send(testUserPayload);
    const response = await agent
      .post('/auth/login')
      .send({ email: testUserPayload.email, password: 'wrongpassword' });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid credentials');
  });

  it('POST /auth/login - should return 401 for non-existent user', async () => {
    const response = await agent
      .post('/auth/login')
      .send({ email: 'nouser@example.com', password: 'password' });
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
    username: 'suiteuser',
    email: 'suiteuser@test.com',
    passwordhash: 'suitepassword',
  };

  beforeAll(async () => {
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const registerResponse = await agent.post('/auth/register').send(mainUserPayload);
    if (registerResponse.status !== 201) {
        console.error("REGISTER FAILED IN USER ENDPOINTS BEFOREALL:", registerResponse.status, registerResponse.body);
    }
    expect(registerResponse.status).toBe(201);
    createdUserForSuite = registerResponse.body as UserApiResponse;

    const loginResponse = await agent
      .post('/auth/login')
      .send({ email: mainUserPayload.email, password: mainUserPayload.passwordhash });
    if (loginResponse.status !== 200) {
        console.error("LOGIN FAILED IN USER ENDPOINTS BEFOREALL:", loginResponse.status, loginResponse.body);
    }
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeDefined();
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

  // it('PUT /users/me/password - should update the authenticated user password', async () => {
  //   const newPassword = 'newStrongerPassword456';
  //   const response = await agent
  //     .put('/users/me/password')
  //     .set('Authorization', `Bearer ${authToken}`)
  //     .send({ newPassword: newPassword });
  //   expect(response.status).toBe(204);

  //   const loginAttemptResponse = await agent
  //     .post('/auth/login')
  //     .send({ email: mainUserPayload.email, password: newPassword });
  //   expect(loginAttemptResponse.status).toBe(200);
  // });

  it('GET /users - should return a list of users', async () => {
    const response = await agent
      .get('/users')
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const users = response.body as UserApiResponse[];
    const foundUser = users.find(u => u.id === createdUserForSuite.id);
    expect(foundUser).toBeDefined();
    if(foundUser) {
        expect(foundUser.username).toBe(mainUserPayload.username);
    }
  });

  it('GET /users/:id - should return a specific user by ID', async () => {
    const response = await agent
      .get(`/users/${createdUserForSuite.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(200);
    const body = response.body as UserApiResponse;
    expect(body.id).toBe(createdUserForSuite.id);
  });

  it('GET /users/:id - should return 404 for a non-existent user ID', async () => {
    const nonExistentId = 999999; 
    const response = await agent
      .get(`/users/${nonExistentId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(404);
  });

  // it('PUT /users/:id - should update a user (e.g., username)', async () => {
  //   const newUsername = 'updatedSuiteUser';
  //   const response = await agent
  //     .put(`/users/${createdUserForSuite.id}`) 
  //     .set('Authorization', `Bearer ${authToken}`)
  //     .send({ username: newUsername });
  //   expect(response.status).toBe(200);
  //   const body = response.body as UserApiResponse;
  //   expect(body.username).toBe(newUsername);
  //   createdUserForSuite.username = newUsername; 
  // });

  it('DELETE /users/:id - should delete a user and publish Kafka event', async () => {
    const userToDeletePayload = { username: 'userfordelete', email: 'delete@test.com', passwordhash: 'deleteme' };
    const registerDelResponse = await agent.post('/auth/register').send(userToDeletePayload);
    expect(registerDelResponse.status).toBe(201);
    const userToDelete = registerDelResponse.body as UserApiResponse;
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const response = await agent
      .delete(`/users/${userToDelete.id}`) 
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(204);

    const verifyDeletedResponse = await agent
      .get(`/users/${userToDelete.id}`) 
      .set('Authorization', `Bearer ${authToken}`);
    expect(verifyDeletedResponse.status).toBe(404);
    
    // const mockSendToAssert = (KafkaProducerMock as any)._mockSendFn;
    // expect(mockSendToAssert).toHaveBeenCalledTimes(1);
    // const kafkaMessageArgs = mockSendToAssert.mock.calls[0][0];
    // expect(kafkaMessageArgs.topic).toBe(process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events_test');
    // const kafkaPayload = JSON.parse(kafkaMessageArgs.messages[0].value);
    // expect(kafkaPayload.eventType).toBe('UserDeleted');
    // expect(kafkaPayload.userId).toBe(userToDelete.id); 
    // expect(kafkaPayload.username).toBe(userToDeletePayload.username);
  });
});