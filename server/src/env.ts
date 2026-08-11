import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// npm workspace scripts run with cwd = server/, but the shared .env lives at the repo root.
config({ path: path.resolve(process.cwd(), '../.env') });
config(); // also allow a server/.env override if present

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRY: z.string().default('7d'),
  // Base URL used to build the link inside verification emails - needs to be
  // the actual client origin (Vercel prod, Render, or local Vite dev), not
  // this server's own origin. Falls back to local Vite dev's default.
  APP_URL: z.string().default('http://localhost:5173'),
  // SMTP is optional on purpose: when unset (e.g. a fresh local checkout),
  // email.ts falls back to a disposable Ethereal test account instead of
  // failing to start - see that file's comment.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Mindflow <no-reply@mindflow.app>'),
  // Optional - "Sign in with Google" (auth.service.ts's googleSignIn()) is
  // simply unavailable until this is set, rather than failing to start.
  GOOGLE_CLIENT_ID: z.string().optional(),
  // Optional - when set, Vercel automatically sends it as
  // `Authorization: Bearer <CRON_SECRET>` on requests it makes to trigger a
  // configured cron job (see vercel.json's crons + routes/cron.routes.ts).
  // Unset locally/on Render, where the due-soon check instead runs via a
  // plain setInterval in index.ts - see that file.
  CRON_SECRET: z.string().optional()
});

export const env = envSchema.parse(process.env);
