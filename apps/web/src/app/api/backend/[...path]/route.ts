import { NextRequest, NextResponse } from 'next/server';

interface ProxyContext {
  params: Promise<{
    path?: string[];
  }>;
}

const API_INTERNAL_BASE_URL = process.env.API_INTERNAL_BASE_URL ?? 'http://localhost:4000';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function proxyRequest(request: NextRequest, context: ProxyContext): Promise<NextResponse> {
  const params = await context.params;
  const path = params.path ?? [];

  if (path.length === 0) {
    return NextResponse.json(
      {
        error: 'InvalidProxyPath',
        message: 'Missing backend API path',
      },
      { status: 400 },
    );
  }

  const upstreamUrl = `${API_INTERNAL_BASE_URL}/api/${path.join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const contentType = request.headers.get('content-type');

  if (authorization) {
    headers.set('authorization', authorization);
  }

  if (contentType) {
    headers.set('content-type', contentType);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  try {
    const upstream = await fetch(upstreamUrl, init);
    const upstreamContentType = upstream.headers.get('content-type') ?? '';

    if (upstreamContentType.includes('text/event-stream') && upstream.body) {
      const responseHeaders = new Headers();
      responseHeaders.set('content-type', 'text/event-stream; charset=utf-8');
      responseHeaders.set('cache-control', 'no-cache, no-transform');
      responseHeaders.set('connection', 'keep-alive');

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    const body = await upstream.text();

    const responseHeaders = new Headers();
    if (upstreamContentType) {
      responseHeaders.set('content-type', upstreamContentType);
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'ApiUnavailable',
        message: 'Unable to reach backend API. Make sure it is running on port 4000.',
      },
      { status: 503 },
    );
  }
}

export function GET(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context);
}

export function POST(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context);
}

export function PUT(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context);
}

export function PATCH(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context);
}

export function DELETE(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context);
}
