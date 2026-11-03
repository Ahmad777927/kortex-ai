import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryApiMetrics, toPrometheusMetrics } from './metrics.js';

test('InMemoryApiMetrics aggregates request and error totals', () => {
  const metrics = new InMemoryApiMetrics();

  metrics.recordRequest({
    method: 'GET',
    route: '/api/chats',
    statusCode: 200,
    durationMs: 20,
  });

  metrics.recordRequest({
    method: 'GET',
    route: '/api/chats',
    statusCode: 502,
    durationMs: 80,
  });

  metrics.recordRequest({
    method: 'POST',
    route: '/api/chats',
    statusCode: 429,
    durationMs: 5,
  });

  const snapshot = metrics.snapshot();

  assert.equal(snapshot.totals.requests, 3);
  assert.equal(snapshot.totals.errors, 1);
  assert.equal(snapshot.totals.rateLimited, 1);
  assert.equal(snapshot.totals.maxLatencyMs, 80);
  assert.ok(snapshot.totals.avgLatencyMs > 0);

  const getRoute = snapshot.routes.find(
    (route) => route.method === 'GET' && route.route === '/api/chats',
  );

  assert.ok(getRoute);
  assert.equal(getRoute?.requests, 2);
  assert.equal(getRoute?.errors, 1);
  assert.equal(getRoute?.statusCounts['2xx'], 1);
  assert.equal(getRoute?.statusCounts['5xx'], 1);
});

test('toPrometheusMetrics serializes global and route counters', () => {
  const metrics = new InMemoryApiMetrics();

  metrics.recordRequest({
    method: 'GET',
    route: '/metrics',
    statusCode: 200,
    durationMs: 1,
  });

  const snapshot = metrics.snapshot();
  const text = toPrometheusMetrics(snapshot);

  assert.match(text, /ai_chat_requests_total 1/);
  assert.match(text, /ai_chat_errors_total 0/);
  assert.match(text, /ai_chat_route_requests_total\{method="GET",route="\/metrics"\} 1/);
  assert.ok(text.endsWith('\n'));
});
