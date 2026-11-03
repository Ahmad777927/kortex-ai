import 'dotenv/config';
import Fastify from 'fastify';
import { env } from './shared/config/env.js';
import { connectMongo, disconnectMongo } from './shared/db/mongo.js';
import './modules/index.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { chatsRoutes } from './modules/chats/chats.routes.js';
import { documentsRoutes } from './modules/documents/documents.routes.js';
import { modelsRoutes } from './modules/models/models.routes.js';
import { retrievalRoutes } from './modules/retrieval/retrieval.routes.js';
import { registerApiRateLimit } from './shared/http/rate-limit.js';
import { registerObservability } from './shared/observability/metrics.js';

const app = Fastify({ logger: true });

registerObservability(app);
registerApiRateLimit(app);

app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString(),
  };
});

app.register(authRoutes, { prefix: '/api/auth' });
app.register(chatsRoutes, { prefix: '/api/chats' });
app.register(documentsRoutes, { prefix: '/api/documents' });
app.register(modelsRoutes, { prefix: '/api/models' });
app.register(retrievalRoutes, { prefix: '/api/retrieval' });

const port = env.API_PORT;
const host = env.API_HOST;

async function bootstrap() {
  await connectMongo();
  app.log.info('MongoDB connected');

  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}`);
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});

async function shutdown() {
  await disconnectMongo();
  await app.close();
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

