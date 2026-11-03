import { FastifyInstance } from 'fastify';
import { requireAuthenticatedUserId } from '../auth/auth.service.js';
import { env } from '../../shared/config/env.js';

function getUserIdFromAuth(authorization?: string): string | null {
  try {
    return requireAuthenticatedUserId(authorization);
  } catch {
    return null;
  }
}

const SUPPORTED_GEMINI_MODELS = [
  {
    name: 'gemini-3.5-flash-lite',
    displayName: 'Gemini 3.5 Flash Lite (Fastest)',
  },
  {
    name: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
  },
  {
    name: 'gemini-flash-latest',
    displayName: 'Gemini Flash (Latest)',
  },
  {
    name: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro (Advanced)',
  },
];

export async function modelsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request, reply) => {
    const userId = getUserIdFromAuth(request.headers.authorization);

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    try {
      const models = SUPPORTED_GEMINI_MODELS.map((model) => ({
        name: model.name,
        sizeBytes: null,
        modifiedAt: new Date().toISOString(),
      }));

      return reply.status(200).send({
        models,
        defaultModel: env.CHAT_MODEL,
        fallbackModel: env.FALLBACK_MODEL,
        source: 'gemini',
      });
    } catch (error: unknown) {
      app.log.warn(error);

      return reply.status(200).send({
        models: [
          { name: env.CHAT_MODEL, sizeBytes: null, modifiedAt: null },
          { name: env.FALLBACK_MODEL, sizeBytes: null, modifiedAt: null },
        ],
        defaultModel: env.CHAT_MODEL,
        fallbackModel: env.FALLBACK_MODEL,
        source: 'gemini',
      });
    }
  });
}
