import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../.env'),
  resolve(process.cwd(), '../../.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadDotEnv({ path: envPath, override: false });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1).default('ai_chat'),
  AUTH_SECRET: z.string().min(16),
  AUTH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  GEMINI_API_KEY: z.string().min(1),
  CHAT_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  FALLBACK_MODEL: z.string().min(1).default('gemini-3.5-flash'),
  EMBED_MODEL: z.string().min(1).default('gemini-embedding-001'),
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  RAG_MIN_SCORE: z.coerce.number().min(-1).max(1).default(0),
  RAG_MAX_CANDIDATES: z.coerce.number().int().min(10).max(5000).default(1000),
  RAG_CONTEXT_MAX_CHARS: z.coerce.number().int().min(500).max(40_000).default(8_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(5).max(10_000).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(60 * 60 * 1000).default(60_000),
  SLOW_REQUEST_MS: z.coerce.number().int().min(50).max(120_000).default(1500),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(20),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  CHUNK_SIZE_CHARS: z.coerce.number().int().min(300).max(5000).default(1800),
  CHUNK_OVERLAP_CHARS: z.coerce.number().int().min(0).max(1200).default(250),
});

const envResult = envSchema.safeParse(process.env);

if (!envResult.success) {
  throw new Error(`Invalid environment variables: ${envResult.error.message}`);
}

export const env = envResult.data;

