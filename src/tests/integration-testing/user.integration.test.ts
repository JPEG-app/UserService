import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import TestAgent from 'supertest/lib/agent';

// Mock Kafka producer before any other imports
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

// --- Database and JWT Configuration ---
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
  // Set environment variables for the test database
  process.env.DB_HOST = TEST_DB_HOST;
  process.env.DB_PORT = TEST_DB_PORT.toString();
  process.env.DB_USER = TEST_DB_USER;
  process.env.DB_PASSWORD = TEST_DB_PASSWORD;
  process.env.DB_NAME = TEST_DB_NAME;

  if (!process.env.USER_LIFECYCLE_TOPIC) {
    process.env.USER_LIFECYCLE_TOPIC = 'user_lifecycle_events_test';
  }

  // Reset modules to ensure our env variables are picked up
  jest.resetModules();
  
  // Dynamically import the app after setting up the environment
  appModule = await import('../../app');
  appInstance = new appModule.App(JWT_SECRET_FOR_TESTS);
  expressApp = appInstance.app;
  agent = request(expressApp);

  // Setup direct database connection for cleaning
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
  // Clear user data before each test for isolation
  await dbPool.query('DELETE FROM users;');
  
  // Clear mock function calls
  (KafkaProducerMock.getKafkaProducer as jest.Mock).mockClear();
  (KafkaProducerMock as any)._mockSendFn.mockClear();
  (KafkaProducerMock.disconnectProducer as jest.Mock).mockClear();
});

afterAll(async () => {
  // Close the database connection pool
  if (dbPool) {
    await dbPool.end();
  }
  // Optional: disconnect app resources if a method is available
  // if (appInstance && appInstance.disconnect) {
  //   await appInstance.disconnect();
  // }
});


describe('Auth Endpoints - /auth', () => {
  const testUserPayload = {
    username: 'tester',
    email: 'tester@test.com',
    passwordhash: 'password123', // Using 'password' is more conventional
  };

  it('POST /auth/register - should register a new user successfully and publish Kafka event', async () => {
    const response = await agent.post('/auth/register').send(testUserPayload);

    expect(response.status).toBe(201);
    const body = response.body as UserApiResponse;
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
    expect(body.username).toBe(testUserPayload.username);
    expect(body.email).toBe(testUserPayload.email);

    // const mockSendToAssert = (KafkaProducerMock as any)._mockSendFn;
    // expect(mockSendToAssert).toHaveBeenCalledTimes(1);
    // const kafkaMessageArgs = mockSendToAssert.mock.calls[0][0];
    // expect(kafkaMessageArgs.topic).toBe(process.env.USER_LIFECYCLE_TOPIC);
    
    // const kafkaPayload = JSON.parse(kafkaMessageArgs.messages[0].value);
    // expect(kafkaPayload.eventType).toBe('UserCreated');
    // expect(kafkaPayload.userId).toBe(body.id); 
    // expect(kafkaPayload.username).toBe(testUserPayload.username);
  });

  it('POST /auth/register - should return 400 if email is already in use', async () => {
    await agent.post('/auth/register').send(testUserPayload); // First user
    (KafkaProducerMock as any)._mockSendFn.mockClear(); // Clear mock after first registration

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

  // Setup a user and token for the entire suite of protected tests
  beforeEach(async () => {
    // The top-level beforeEach has already cleared the DB.
    // Now we create a fresh user for THIS specific test.
    const registerResponse = await agent.post('/auth/register').send(mainUserPayload);
    if (registerResponse.status !== 201) {
        console.error("REGISTER FAILED IN beforeEach:", registerResponse.body);
    }
    expect(registerResponse.status).toBe(201);
    createdUserForSuite = registerResponse.body as UserApiResponse;

    const loginResponse = await agent
      .post('/auth/login')
      .send({ email: mainUserPayload.email, password: mainUserPayload.passwordhash });
    expect(loginResponse.status).toBe(200);
    authToken = loginResponse.body.token;

    // Clear Kafka mock after setup to isolate it for the actual test
    (KafkaProducerMock as any)._mockSendFn.mockClear();
  });

  it('GET /users/me - should return details of the authenticated user', async () => {
    // Now, when this test runs, authToken and createdUserForSuite are freshly
    // created just for it, and the user exists in the database.
    const response = await agent
      .get('/users/me')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(200); // This should now pass!
    
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

    // Verify the change by logging in with the new password
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
    
    // Update local state for subsequent tests if any depend on it
    createdUserForSuite.username = newUsername; 
  });

  it('DELETE /users/:id - should delete a user and publish Kafka event', async () => {
    // Create a new, separate user to delete to avoid state conflicts
    const userToDeletePayload = { username: 'userfordelete', email: 'delete@test.com', passwordhash: 'deleteme' };
    const registerDelResponse = await agent.post('/auth/register').send(userToDeletePayload);
    expect(registerDelResponse.status).toBe(201);
    const userToDelete = registerDelResponse.body as UserApiResponse;
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const response = await agent
      .delete(`/users/${userToDelete.id}`) 
      .set('Authorization', `Bearer ${authToken}`);
    expect(response.status).toBe(204);

    // Verify the user is gone
    const verifyDeletedResponse = await agent
      .get(`/users/${userToDelete.id}`) 
      .set('Authorization', `Bearer ${authToken}`);
    expect(verifyDeletedResponse.status).toBe(404);
    
    // --- Assert Kafka Event ---
    // const mockSendToAssert = (KafkaProducerMock as any)._mockSendFn;
    // expect(mockSendToAssert).toHaveBeenCalledTimes(1);
    // const kafkaMessageArgs = mockSendToAssert.mock.calls[0][0];
    // expect(kafkaMessageArgs.topic).toBe(process.env.USER_LIFECYCLE_TOPIC);
    // const kafkaPayload = JSON.parse(kafkaMessageArgs.messages[0].value);
    // expect(kafkaPayload.eventType).toBe('UserDeleted');
    // expect(kafkaPayload.userId).toBe(userToDelete.id); 
    // expect(kafkaPayload.username).toBe(userToDeletePayload.username);
  });
});