import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthToken,
  hashPassword,
  parseBearerToken,
  requireAuthenticatedUserId,
  verifyAuthToken,
  verifyPassword,
} from './auth.service.js';

test('createAuthToken and verifyAuthToken round-trip payload', () => {
  const sub = '507f1f77bcf86cd799439011';

  const token = createAuthToken({
    sub,
    email: 'user@example.com',
    role: 'user',
  });

  const payload = verifyAuthToken(token);

  assert.equal(payload.sub, sub);
  assert.equal(payload.email, 'user@example.com');
  assert.equal(payload.role, 'user');
  assert.ok(payload.exp > payload.iat);
});

test('parseBearerToken returns token only for bearer auth', () => {
  assert.equal(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(parseBearerToken('bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(parseBearerToken('Token abc.def.ghi'), null);
  assert.equal(parseBearerToken(undefined), null);
});

test('requireAuthenticatedUserId accepts valid bearer token payload', () => {
  const sub = '507f1f77bcf86cd799439012';

  const token = createAuthToken({
    sub,
    email: 'valid@example.com',
    role: 'user',
  });

  const resolved = requireAuthenticatedUserId(`Bearer ${token}`);
  assert.equal(resolved, sub);
});

test('hashPassword and verifyPassword handle valid and invalid secrets', async () => {
  const hash = await hashPassword('my-secret-password');

  assert.ok(await verifyPassword('my-secret-password', hash));
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(await verifyPassword('my-secret-password', 'invalid-format-hash'), false);
});
