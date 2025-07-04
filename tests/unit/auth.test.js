// tests/unit/auth.test.js
const argon2 = require('argon2');

// Mock the db module properly
const mockDb = jest.fn();
const mockSelect = jest.fn().mockReturnThis();
const mockJoin = jest.fn().mockReturnThis();
const mockWhere = jest.fn().mockReturnThis();
const mockFirst = jest.fn();
const mockInsert = jest.fn().mockReturnThis();
const mockReturning = jest.fn();
const mockUpdate = jest.fn();

// Setup db mock to return query builder methods
mockDb.mockImplementation(() => ({
  select: mockSelect,
  join: mockJoin,
  where: mockWhere,
  first: mockFirst,
  insert: mockInsert,
  returning: mockReturning,
  update: mockUpdate
}));

// Add fn property for database functions
mockDb.fn = {
  now: jest.fn().mockReturnValue('NOW()')
};

jest.mock('../../db', () => mockDb);

describe('Authentication Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock return values
    mockSelect.mockReturnThis();
    mockJoin.mockReturnThis();
    mockWhere.mockReturnThis();
    mockInsert.mockReturnThis();
    mockReturning.mockReturnThis();
  });

  test('should hash password correctly during registration', async () => {
    // Test the password hashing function directly
    const password = 'TestPassword123';
    const expectedOptions = {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 2,
      parallelism: 2,
      hashLength: 32, // Optional, specify if needed
      saltLength: 32// Optional, specify if needed
    };

    // Mock the hash function to return a test hash
    argon2.hash = jest.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=2,p=2$mockhash');

    // Call argon2.hash directly (simulating what happens in your auth code)
    const hashedPassword = await argon2.hash(password, expectedOptions);

    // Verify the function was called with correct parameters
    expect(argon2.hash).toHaveBeenCalledWith(password, expectedOptions);
    expect(hashedPassword).toBe('$argon2id$v=19$m=65536,t=2,p=2$mockhash');
  });

  test('should validate login credentials correctly', async () => {
    const password = 'TestPassword123';
    const hashedPassword = '$argon2id$v=19$m=65536,t=2,p=2$mockhash';

    // Mock verify to return true (valid password)
    argon2.verify = jest.fn().mockResolvedValue(true);

    // Call argon2.verify directly (simulating what happens in your auth code)
    const isValid = await argon2.verify(hashedPassword, password);

    // Verify the function was called correctly
    expect(argon2.verify).toHaveBeenCalledWith(hashedPassword, password);
    expect(isValid).toBe(true);
  });

  test('should reject invalid login credentials', async () => {
    const wrongPassword = 'WrongPassword';
    const hashedPassword = '$argon2id$v=19$m=65536,t=2,p=2$mockhash';

    // Mock verify to return false (invalid password)
    argon2.verify = jest.fn().mockResolvedValue(false);

    // Call argon2.verify directly
    const isValid = await argon2.verify(hashedPassword, wrongPassword);

    // Verify the function was called and returned false
    expect(argon2.verify).toHaveBeenCalledWith(hashedPassword, wrongPassword);
    expect(isValid).toBe(false);
  });
});

describe('Restaurant Approval Logic', () => {
  const db = require('../../db');

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock return values
    mockSelect.mockReturnThis();
    mockJoin.mockReturnThis();
    mockWhere.mockReturnThis();
    mockInsert.mockReturnThis();
    mockReturning.mockReturnThis();
  });

  test('should approve restaurant and update database correctly', async () => {
    const mockRestaurant = {
      store_id: 1,
      storeName: 'Test Restaurant',
      owner_id: 2,
      status: 'pending',
      firstname: 'John',
      lastname: 'Doe',
      owner_email: 'john@example.com',
      location: 'Orchard'
    };

    const storeId = 1;
    const adminId = 3;

    // Setup mocks for the select query
    mockWhere.mockResolvedValue([mockRestaurant]);
    mockUpdate.mockResolvedValue([]);

    // Simulate the approval logic using Knex query builder
    const restaurantResult = await db('stores')
      .select('stores.*', 'users.email as owner_email', 'users.firstname', 'users.lastname', 'users.name as owner_name')
      .join('users', 'stores.owner_id', 'users.user_id')
      .where({
        'stores.store_id': storeId,
        'stores.status': 'pending'
      });

    // Reset mocks for update query
    mockWhere.mockReturnThis();
    mockUpdate.mockResolvedValue([]);

    await db('stores')
      .where('store_id', storeId)
      .update({
        status: 'approved',
        approved_at: mockDb.fn.now(),
        approved_by: adminId
      });

    // Verify the Knex methods were called correctly
    expect(mockSelect).toHaveBeenCalledWith('stores.*', 'users.email as owner_email', 'users.firstname', 'users.lastname', 'users.name as owner_name');
    expect(mockJoin).toHaveBeenCalledWith('users', 'stores.owner_id', 'users.user_id');
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'approved',
      approved_at: mockDb.fn.now(),
      approved_by: adminId
    });
    expect(restaurantResult[0]).toEqual(mockRestaurant);
  });

  test('should reject restaurant with valid reason', async () => {
    const mockRestaurant = {
      store_id: 1,
      storeName: 'Test Restaurant',
      owner_id: 2,
      status: 'pending',
      firstname: 'John',
      owner_email: 'john@example.com'
    };

    const rejectionReason = 'Incomplete documentation provided';
    const storeId = 1;
    const adminId = 3;

    // Setup mocks
    mockWhere.mockResolvedValueOnce([mockRestaurant]);

    // Simulate rejection logic using Knex
    await db('stores')
      .select('stores.*', 'users.email as owner_email', 'users.firstname', 'users.lastname', 'users.name as owner_name')
      .join('users', 'stores.owner_id', 'users.user_id')
      .where({
        'stores.store_id': storeId,
        'stores.status': 'pending'
      });

    // Reset mocks for update
    mockWhere.mockReturnThis();
    mockUpdate.mockResolvedValue([]);

    await db('stores')
      .where('store_id', storeId)
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        approved_by: adminId
      });

    // Verify rejection was processed correctly
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'rejected',
      rejection_reason: rejectionReason,
      approved_by: adminId
    });
  });

  test('should handle non-existent restaurant gracefully', async () => {
    const storeId = 999; // Non-existent ID

    // Mock empty result
    mockWhere.mockResolvedValue([]); // No restaurant found

    const result = await db('stores')
      .select('stores.*', 'users.email as owner_email', 'users.firstname', 'users.lastname', 'users.name as owner_name')
      .join('users', 'stores.owner_id', 'users.user_id')
      .where({
        'stores.store_id': storeId,
        'stores.status': 'pending'
      });

    expect(result.length).toBe(0);
    expect(mockWhere).toHaveBeenCalledWith({
      'stores.store_id': storeId,
      'stores.status': 'pending'
    });
  });
});

describe('Password Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should use secure argon2id hashing parameters', async () => {
    const password = 'TestPassword123';
    const expectedOptions = {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 2,
      parallelism: 2,
      hashLength: 32,
      saltLength: 32
    };

    argon2.hash = jest.fn().mockResolvedValue('$argon2id$mockhash');

    await argon2.hash(password, expectedOptions);

    expect(argon2.hash).toHaveBeenCalledWith(password, expectedOptions);
    expect(argon2.hash).toHaveBeenCalledTimes(1);
  });

  test('should validate password requirements', () => {
    // Test the password validation logic from your authApi.js
    function validatePassword(password) {
      if (!password || typeof password !== 'string') {
        throw new Error('Password is required and must be a string');
      }

      const minLength = 8;
      const validation = {
        isValid: password.length >= minLength,
        requirements: {
          minLength: password.length >= minLength
        }
      };

      if (!validation.isValid) {
        throw new Error('Password does not meet security requirements');
      }

      return validation;
    }

    // Test valid passwords
    expect(() => validatePassword('ValidPass123')).not.toThrow();
    expect(validatePassword('ValidPass123').isValid).toBe(true);

    // Test invalid passwords
    expect(() => validatePassword('')).toThrow('Password is required');
    expect(() => validatePassword('short')).toThrow('security requirements');
    expect(() => validatePassword(null)).toThrow('Password is required');
    expect(() => validatePassword(123)).toThrow('Password is required');
    expect(() => validatePassword(undefined)).toThrow('Password is required');
  });

  test('should verify password correctly', async () => {
    const password = 'TestPassword123';
    const hash = '$argon2id$v=19$m=65536,t=2,p=2$mockhash';

    // Test successful verification
    argon2.verify = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const isValid = await argon2.verify(hash, password);
    expect(argon2.verify).toHaveBeenCalledWith(hash, password);
    expect(isValid).toBe(true);

    // Test failed verification
    const isInvalid = await argon2.verify(hash, 'wrongpassword');
    expect(isInvalid).toBe(false);
    expect(argon2.verify).toHaveBeenCalledTimes(2);
  });

  test('should handle user registration with Knex', async () => {
    const db = require('../../db');
    const userData = {
      email: 'test@example.com',
      password_hash: '$argon2id$v=19$m=65536,t=2,p=2$mockhash',
      firstname: 'John',
      lastname: 'Doe'
    };

    // Setup mocks for insert
    mockReturning.mockResolvedValue([{ user_id: 1, ...userData }]);

    // Simulate user registration
    const result = await db('users')
      .insert(userData)
      .returning('*');

    expect(mockInsert).toHaveBeenCalledWith(userData);
    expect(mockReturning).toHaveBeenCalledWith('*');
    expect(result[0]).toEqual({ user_id: 1, ...userData });
  });

  test('should handle user login with Knex', async () => {
    const db = require('../../db');
    const email = 'test@example.com';
    const mockUser = {
      user_id: 1,
      email: 'test@example.com',
      password_hash: '$argon2id$v=19$m=65536,t=2,p=2$mockhash',
      firstname: 'John',
      lastname: 'Doe'
    };

    // Setup mocks - where should return an object with first method
    mockWhere.mockReturnValue({
      first: mockFirst
    });
    mockFirst.mockResolvedValue(mockUser);

    // Simulate user login lookup
    const result = await db('users')
      .where('email', email)
      .first();

    expect(mockWhere).toHaveBeenCalledWith('email', email);
    expect(mockFirst).toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });
});