import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

type HttpStatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

interface RouteMetricsAccumulator {
  method: string;
  route: string;
  requests: number;
  errors: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  statusCounts: Record<HttpStatusClass, number>;
}

export interface RouteMetricsSnapshot {
  method: string;
  route: string;
  requests: number;
  errors: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  statusCounts: Record<HttpStatusClass, number>;
}

export interface ApiMetricsSnapshot {
  generatedAt: string;
  process: {
    uptimeSec: number;
    memoryRssBytes: number;
    heapUsedBytes: number;
  };
  totals: {
    requests: number;
    errors: number;
    rateLimited: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
  };
  routes: RouteMetricsSnapshot[];
}

export interface RequestMetricInput {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeLatency(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function toStatusClass(statusCode: number): HttpStatusClass {
  if (statusCode >= 500) {
    return '5xx';
  }

  if (statusCode >= 400) {
    return '4xx';
  }

  if (statusCode >= 300) {
    return '3xx';
  }

  if (statusCode >= 200) {
    return '2xx';
  }

  return '1xx';
}

function toRouteKey(method: string, route: string): string {
  return `${method.toUpperCase()} ${route}`;
}

function routeStatusCounts(): Record<HttpStatusClass, number> {
  return {
    '1xx': 0,
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  };
}

export class InMemoryApiMetrics {
  private totalRequests = 0;

  private totalErrors = 0;

  private totalRateLimited = 0;

  private totalLatencyMs = 0;

  private maxLatencyMs = 0;

  private readonly routeMetrics = new Map<string, RouteMetricsAccumulator>();

  recordRequest(input: RequestMetricInput): void {
    const method = input.method.toUpperCase();
    const route = input.route;
    const statusCode = Math.floor(input.statusCode);
    const durationMs = normalizeLatency(input.durationMs);

    const statusClass = toStatusClass(statusCode);

    this.totalRequests += 1;
    this.totalLatencyMs += durationMs;
    this.maxLatencyMs = Math.max(this.maxLatencyMs, durationMs);

    if (statusCode >= 500) {
      this.totalErrors += 1;
    }

    if (statusCode === 429) {
      this.totalRateLimited += 1;
    }

    const key = toRouteKey(method, route);
    let routeMetric = this.routeMetrics.get(key);

    if (!routeMetric) {
      routeMetric = {
        method,
        route,
        requests: 0,
        errors: 0,
        totalLatencyMs: 0,
        maxLatencyMs: 0,
        statusCounts: routeStatusCounts(),
      };

      this.routeMetrics.set(key, routeMetric);
    }

    routeMetric.requests += 1;
    routeMetric.totalLatencyMs += durationMs;
    routeMetric.maxLatencyMs = Math.max(routeMetric.maxLatencyMs, durationMs);
    routeMetric.statusCounts[statusClass] += 1;

    if (statusCode >= 500) {
      routeMetric.errors += 1;
    }
  }

  snapshot(): ApiMetricsSnapshot {
    const routes = [...this.routeMetrics.values()]
      .map<RouteMetricsSnapshot>((metric) => ({
        method: metric.method,
        route: metric.route,
        requests: metric.requests,
        errors: metric.errors,
        avgLatencyMs:
          metric.requests > 0 ? Number((metric.totalLatencyMs / metric.requests).toFixed(2)) : 0,
        maxLatencyMs: Number(metric.maxLatencyMs.toFixed(2)),
        statusCounts: {
          ...metric.statusCounts,
        },
      }))
      .sort((left, right) => {
        if (right.requests !== left.requests) {
          return right.requests - left.requests;
        }

        return `${left.method} ${left.route}`.localeCompare(`${right.method} ${right.route}`);
      });

    const avgLatencyMs =
      this.totalRequests > 0 ? Number((this.totalLatencyMs / this.totalRequests).toFixed(2)) : 0;

    const memoryUsage = process.memoryUsage();

    return {
      generatedAt: new Date().toISOString(),
      process: {
        uptimeSec: Number(process.uptime().toFixed(2)),
        memoryRssBytes: normalizeCount(memoryUsage.rss),
        heapUsedBytes: normalizeCount(memoryUsage.heapUsed),
      },
      totals: {
        requests: this.totalRequests,
        errors: this.totalErrors,
        rateLimited: this.totalRateLimited,
        avgLatencyMs,
        maxLatencyMs: Number(this.maxLatencyMs.toFixed(2)),
      },
      routes,
    };
  }
}

function escapeMetricLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function toPrometheusMetrics(snapshot: ApiMetricsSnapshot): string {
  const lines: string[] = [];

  lines.push('# HELP ai_chat_requests_total Total number of processed HTTP requests');
  lines.push('# TYPE ai_chat_requests_total counter');
  lines.push(`ai_chat_requests_total ${snapshot.totals.requests}`);

  lines.push('# HELP ai_chat_errors_total Total number of 5xx responses');
  lines.push('# TYPE ai_chat_errors_total counter');
  lines.push(`ai_chat_errors_total ${snapshot.totals.errors}`);

  lines.push('# HELP ai_chat_rate_limited_total Total number of rate-limited responses');
  lines.push('# TYPE ai_chat_rate_limited_total counter');
  lines.push(`ai_chat_rate_limited_total ${snapshot.totals.rateLimited}`);

  lines.push('# HELP ai_chat_request_latency_ms_avg Average request latency in milliseconds');
  lines.push('# TYPE ai_chat_request_latency_ms_avg gauge');
  lines.push(`ai_chat_request_latency_ms_avg ${snapshot.totals.avgLatencyMs}`);

  lines.push('# HELP ai_chat_request_latency_ms_max Max request latency in milliseconds');
  lines.push('# TYPE ai_chat_request_latency_ms_max gauge');
  lines.push(`ai_chat_request_latency_ms_max ${snapshot.totals.maxLatencyMs}`);

  lines.push('# HELP ai_chat_route_requests_total Route requests by method and route');
  lines.push('# TYPE ai_chat_route_requests_total counter');

  for (const route of snapshot.routes) {
    const methodLabel = escapeMetricLabel(route.method);
    const routeLabel = escapeMetricLabel(route.route);
    lines.push(
      `ai_chat_route_requests_total{method="${methodLabel}",route="${routeLabel}"} ${route.requests}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function normalizeRoutePath(request: FastifyRequest): string {
  const routePath = request.routeOptions.url;
  if (typeof routePath === 'string' && routePath.length > 0) {
    return routePath;
  }

  const [pathWithoutQuery] = request.url.split('?');
  return pathWithoutQuery || '/unknown';
}

export function registerObservability(app: FastifyInstance): void {
  const metrics = new InMemoryApiMetrics();
  const requestStartTimes = new WeakMap<FastifyRequest, bigint>();

  app.addHook('onRequest', async (request) => {
    requestStartTimes.set(request, process.hrtime.bigint());
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStartTimes.get(request);
    requestStartTimes.delete(request);

    const durationMs = startedAt
      ? Number(process.hrtime.bigint() - startedAt) / 1_000_000
      : 0;

    const route = normalizeRoutePath(request);
    const statusCode = reply.statusCode;

    metrics.recordRequest({
      method: request.method,
      route,
      statusCode,
      durationMs,
    });

    const logPayload = {
      requestId: request.id,
      method: request.method,
      route,
      url: request.url,
      statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    };

    if (durationMs >= env.SLOW_REQUEST_MS) {
      app.log.warn(logPayload, 'slow request');
      return;
    }

    app.log.info(logPayload, 'request completed');
  });

  app.get('/metrics', async (_request, reply) => {
    return reply.status(200).send(metrics.snapshot());
  });

  app.get('/metrics/prometheus', async (_request, reply) => {
    const payload = toPrometheusMetrics(metrics.snapshot());
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.status(200).send(payload);
  });
}
