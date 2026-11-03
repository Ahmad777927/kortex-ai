import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { isValidObjectId } from 'mongoose';
import { env } from '../../shared/config/env.js';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signTokenPart(data: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(data).digest('base64url');
}

export function createAuthToken(payload: {
  sub: string;
  email: string;
  role: 'user' | 'admin';
}): string {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + env.AUTH_TOKEN_TTL_SECONDS,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = signTokenPart(`${header}.${body}`);

  return `${header}.${body}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const [header, body, signature] = token.split('.');

  if (!header || !body || !signature) {
    throw new Error('Invalid token format');
  }

  const expectedSignature = signTokenPart(`${header}.${body}`);

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('Invalid token signature');
  }

  const parsed = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;

  if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return parsed;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalDigest] = storedHash.split(':');

  if (!salt || !originalDigest) {
    return false;
  }

  const computedDigest = scryptSync(password, salt, 64).toString('hex');

  const originalBuffer = Buffer.from(originalDigest, 'hex');
  const computedBuffer = Buffer.from(computedDigest, 'hex');

  if (originalBuffer.length !== computedBuffer.length) {
    return false;
  }

  return timingSafeEqual(originalBuffer, computedBuffer);
}

export function parseBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

export function requireAuthenticatedUserId(authHeader?: string): string {
  const token = parseBearerToken(authHeader);
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const payload = verifyAuthToken(token);
  if (!isValidObjectId(payload.sub)) {
    throw new Error('Invalid auth token payload');
  }

  return payload.sub;
}

