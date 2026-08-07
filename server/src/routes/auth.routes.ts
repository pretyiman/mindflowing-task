import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  changePasswordSchema,
  googleSignInSchema,
  loginSchema,
  registerSchema,
  updateAppModeSchema,
  verifyEmailSchema
} from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await authService.register(body);
    reply.status(201).send(result);
  });

  app.post('/auth/login', async (request) => {
    const body = loginSchema.parse(request.body);
    return authService.login(body);
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    return authService.me(request.user!.id);
  });

  app.patch('/auth/password', { preHandler: requireAuth }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body);
    await authService.changePassword(request.user!.id, body.currentPassword, body.newPassword);
    reply.status(204).send();
  });

  app.patch('/auth/app-mode', { preHandler: requireAuth }, async (request) => {
    const body = updateAppModeSchema.parse(request.body);
    return authService.updateAppMode(request.user!.id, body.appMode);
  });

  app.post('/auth/verify-email', async (request) => {
    const body = verifyEmailSchema.parse(request.body);
    return authService.verifyEmail(body.token);
  });

  app.post('/auth/resend-verification', { preHandler: requireAuth }, async (request, reply) => {
    await authService.resendVerification(request.user!.id);
    reply.status(204).send();
  });

  app.post('/auth/google', async (request) => {
    const body = googleSignInSchema.parse(request.body);
    return authService.googleSignIn(body.credential);
  });
}
