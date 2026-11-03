import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryRateLimiter } from './rate-limit.js';

test('createInMemoryRateLimiter allows requests up to configured limit', () => {
  const limiter = createInMemoryRateLimiter({
    limit: 3,
    windowMs: 10_000,
  });

  const first = limiter.consume('user:abc', 1_000);
  const second = limiter.consume('user:abc', 1_500);
  const third = limiter.consume('user:abc', 2_000);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 1);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
});

test('createInMemoryRateLimiter blocks requests over the limit and returns retry hint', () => {
  const limiter = createInMemoryRateLimiter({
    limit: 2,
    windowMs: 10_000,
  });

  limiter.consume('ip:127.0.0.1', 20_000);
  limiter.consume('ip:127.0.0.1', 20_100);
  const blocked = limiter.consume('ip:127.0.0.1', 20_200);

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test('createInMemoryRateLimiter resets counters after window elapses', () => {
  const limiter = createInMemoryRateLimiter({
    limit: 1,
    windowMs: 5_000,
  });

  const first = limiter.consume('user:xyz', 10_000);
  const blocked = limiter.consume('user:xyz', 10_100);
  const afterReset = limiter.consume('user:xyz', 15_001);

  assert.equal(first.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.remaining, 0);
});

test('createInMemoryRateLimiter cleanup removes expired buckets', () => {
  const limiter = createInMemoryRateLimiter({
    limit: 2,
    windowMs: 1_000,
  });

  limiter.consume('a', 0);
  limiter.consume('b', 100);
  limiter.consume('c', 200);

  const removed = limiter.cleanup(2_000);

  assert.equal(removed, 3);
  assert.equal(limiter.size(), 0);
});
