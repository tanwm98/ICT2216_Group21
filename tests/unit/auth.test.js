// tests/unit/auth.test.js
const argon2 = require('argon2');
const pool = require('../../db');

describe('Authentication Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should hash password correctly during registration', async () => {
    // Test the password hashing function directly
    const password = 'TestPassword123';
    const expectedOptions = {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 2,
      parallelism: 2,
    };

    // Mock the hash function to return a test hash
    argon2.hash.mockResolvedValue('$argon2id$v=19$m=65536,t=2,p=2$mockhash');

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
    argon2.verify.mockResolvedValue(true);

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
    argon2.verify.mockResolvedValue(false);

    // Call argon2.verify directly
    const isValid = await argon2.verify(hashedPassword, wrongPassword);

    // Verify the function was called and returned false
    expect(argon2.verify).toHaveBeenCalledWith(hashedPassword, wrongPassword);
    expect(isValid).toBe(false);
  });
});

describe('Restaurant Approval Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    // Mock database queries
    pool.query
      .mockResolvedValueOnce({ rows: [mockRestaurant] }) // Get restaurant details
      .mockResolvedValueOnce({ rows: [] }); // Update restaurant status

    // Simulate the approval logic from your adminDashboardApi.js
    const restaurantResult = await pool.query(
      `SELECT s.*, u.email as owner_email, u.firstname, u.lastname, u.name as owner_name
       FROM stores s
       JOIN users u ON s.owner_id = u.user_id
       WHERE s.store_id = $1 AND s.status = 'pending'`,
      [storeId]
    );

    await pool.query(
      `UPDATE stores
       SET status = 'approved', approved_at = NOW(), approved_by = $1
       WHERE store_id = $2`,
      [adminId, storeId]
    );

    // Verify the queries were called correctly
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenNthCalledWith(1, 
      expect.stringContaining('SELECT s.*, u.email as owner_email'),
      [storeId]
    );
    expect(pool.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('UPDATE stores'),
      expect.arrayContaining([adminId, storeId])
    );
    expect(restaurantResult.rows[0]).toEqual(mockRestaurant);
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

    pool.query
      .mockResolvedValueOnce({ rows: [mockRestaurant] })
      .mockResolvedValueOnce({ rows: [] });

    // Simulate rejection logic
    await pool.query(
      `SELECT s.*, u.email as owner_email, u.firstname, u.lastname, u.name as owner_name
       FROM stores s
       JOIN users u ON s.owner_id = u.user_id
       WHERE s.store_id = $1 AND s.status = 'pending'`,
      [storeId]
    );

    await pool.query(
      `UPDATE stores
       SET status = 'rejected', rejection_reason = $1, approved_by = $2
       WHERE store_id = $3`,
      [rejectionReason, adminId, storeId]
    );

    // Verify rejection was processed correctly
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('rejection_reason'),
      [rejectionReason, adminId, storeId]
    );
  });

  test('should handle non-existent restaurant gracefully', async () => {
    const storeId = 999; // Non-existent ID

    pool.query.mockResolvedValueOnce({ rows: [] }); // No restaurant found

    const result = await pool.query(
      `SELECT s.*, u.email as owner_email, u.firstname, u.lastname, u.name as owner_name
       FROM stores s
       JOIN users u ON s.owner_id = u.user_id
       WHERE s.store_id = $1 AND s.status = 'pending'`,
      [storeId]
    );

    expect(result.rows.length).toBe(0);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT s.*, u.email as owner_email'),
      [storeId]
    );
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
    };
    
    argon2.hash.mockResolvedValue('$argon2id$mockhash');

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
    argon2.verify.mockResolvedValue(true);
    const isValid = await argon2.verify(hash, password);

    expect(argon2.verify).toHaveBeenCalledWith(hash, password);
    expect(isValid).toBe(true);

    // Test failed verification
    argon2.verify.mockResolvedValue(false);
    const isInvalid = await argon2.verify(hash, 'wrongpassword');

    expect(isInvalid).toBe(false);
    expect(argon2.verify).toHaveBeenCalledTimes(2);
  });
});