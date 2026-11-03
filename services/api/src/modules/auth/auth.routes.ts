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
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name cannot exceed 80 characters'),
  email: z.string().trim().email('Please enter a valid email address').max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password cannot exceed 100 characters'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(200),
  password: z.string().min(1, 'Password is required').max(100),
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
      const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid signup details';
      return reply.status(400).send({
        error: 'ValidationError',
        message: firstIssue,
        details: parsed.error.flatten(),
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
      const passwordHash = await hashPassword(parsed.data.password);
      const user = await UserModel.create({
        name: parsed.data.name,
        email,
        passwordHash,
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
      const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid email or password';
      return reply.status(400).send({
        error: 'ValidationError',
        message: firstIssue,
        details: parsed.error.flatten(),
      });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await UserModel.findOne({ email });

    const isPasswordValid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;

    if (!user || !isPasswordValid) {
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

