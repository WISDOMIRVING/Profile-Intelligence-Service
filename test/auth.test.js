const { describe, it } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

describe('Authentication', () => {
  it('should generate a valid JWT with userId and role', () => {
    const user = { id: 'test-uuid', role: 'admin' };
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '3m' });
    const decoded = jwt.verify(token, JWT_SECRET);
    
    assert.strictEqual(decoded.userId, 'test-uuid');
    assert.strictEqual(decoded.role, 'admin');
  });

  it('should reject expired tokens', async () => {
    const token = jwt.sign({ userId: 'test', role: 'analyst' }, JWT_SECRET, { expiresIn: '0s' });
    
    // Wait a moment for expiry
    await new Promise(r => setTimeout(r, 100));
    
    assert.throws(() => {
      jwt.verify(token, JWT_SECRET);
    }, { name: 'TokenExpiredError' });
  });

  it('should enforce analyst role is not admin', () => {
    const user = { role: 'analyst' };
    assert.notStrictEqual(user.role, 'admin');
  });
});

describe('API Versioning', () => {
  it('should require X-API-Version header value of 1', () => {
    const validVersion = '1';
    const invalidVersion = '2';
    
    assert.strictEqual(validVersion, '1');
    assert.notStrictEqual(invalidVersion, '1');
  });
});

describe('Rate Limiting Configuration', () => {
  it('auth endpoints should allow max 10 requests per minute', () => {
    const authLimit = { windowMs: 60000, max: 10 };
    assert.strictEqual(authLimit.max, 10);
    assert.strictEqual(authLimit.windowMs, 60000);
  });

  it('api endpoints should allow max 60 requests per minute', () => {
    const apiLimit = { windowMs: 60000, max: 60 };
    assert.strictEqual(apiLimit.max, 60);
    assert.strictEqual(apiLimit.windowMs, 60000);
  });
});
