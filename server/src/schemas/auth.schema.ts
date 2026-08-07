import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(100).optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200)
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1)
});

export const googleSignInSchema = z.object({
  credential: z.string().min(1)
});

export const updateAppModeSchema = z.object({
  appMode: z.enum(['TASK_MANAGER', 'MINDFLOW', 'BOTH'])
});
