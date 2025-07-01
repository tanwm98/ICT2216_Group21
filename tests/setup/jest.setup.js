// tests/setup/jest.setup.js
require('dotenv').config({ path: '.env.test' });

// Mock database pool for unit tests
jest.mock('../../db', () => ({
  query: jest.fn(),
}));

// Mock nodemailer for email tests
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  }))
}));

// Mock argon2 for password tests
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=2,p=2$mockhashedpassword'),
  verify: jest.fn()
}));

// Mock filesystem operations
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn()
}));

// Setup global test timeout
jest.setTimeout(10000);

// Clean up mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});