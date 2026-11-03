import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserModel } from '../users/user.model.js';
import {
  createAuthToken,
  hashPassword,
  requireAuthenticatedUserId,
  verifyPassword,
} from './auth.service.js';

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(100),
});

function sanitizeUser(user: {
  _id: { toString(): string };
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/signup', async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const email = parsed.data.email.toLowerCase();

    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      return reply.status(409).send({
        error: 'EmailInUse',
        message: 'Email is already registered',
      });
    }

    try {
      const user = await UserModel.create({
        name: parsed.data.name,
        email,
        passwordHash: hashPassword(parsed.data.password),
        role: 'user',
      });

      const token = createAuthToken({
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      return reply.status(201).send({
        token,
        user: sanitizeUser(user),
      });
    } catch (error: unknown) {
      const mongoError = error as { code?: number };
      if (mongoError.code === 11000) {
        return reply.status(409).send({
          error: 'EmailInUse',
          message: 'Email is already registered',
        });
      }

      throw error;
    }
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: parsed.error.flatten(),
      });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await UserModel.findOne({ email });

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({
        error: 'InvalidCredentials',
        message: 'Invalid email or password',
      });
    }

    const token = createAuthToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    return reply.status(200).send({
      token,
      user: sanitizeUser(user),
    });
  });

  app.post('/logout', async (_request, reply) => {
    return reply.status(200).send({
      success: true,
    });
  });

  app.get('/me', async (request, reply) => {
    let userId: string;

    try {
      userId = requireAuthenticatedUserId(request.headers.authorization);
    } catch {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token',
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return reply.status(404).send({
        error: 'UserNotFound',
        message: 'User not found',
      });
    }

    return reply.status(200).send({
      user: sanitizeUser(user),
    });
  });
}

