import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { sendVerificationEmail } from '../lib/email.js';

type RegisterInput = { email: string; password: string; name?: string };
type LoginInput = { email: string; password: string };

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

// Only constructed when configured - googleSignIn() below is the one place
// that ever needs it, and it fails clearly rather than crashing at startup
// when Google sign-in just isn't set up yet.
const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRY } as jwt.SignOptions);
}

function toPublicUser(user: {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  appMode: 'TASK_MANAGER' | 'MINDFLOW' | 'BOTH';
}) {
  return { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified, appMode: user.appMode };
}

async function issueVerificationToken(userId: string, email: string) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.emailVerificationToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) }
  });
  await sendVerificationEmail(email, token);
}

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError('An account with this email already exists');

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash, name: data.name }
  });
  await issueVerificationToken(user.id, user.email);
  return { user: toPublicUser(user), token: signToken(user.id) };
}

export async function verifyEmail(token: string) {
  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    throw new UnauthorizedError('This verification link is invalid or has expired');
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
    return updated;
  });

  return toPublicUser(user);
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  if (user.emailVerified) throw new ConflictError('This email is already verified');

  const latest = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new ConflictError('Please wait a moment before requesting another email');
  }

  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  await issueVerificationToken(user.id, user.email);
}

export async function login(data: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user?.passwordHash) throw new UnauthorizedError('Invalid email or password');

  const valid = await verifyPassword(data.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  return { user: toPublicUser(user), token: signToken(user.id) };
}

/**
 * Verifies a Google ID token (from the client's Google Identity Services
 * sign-in) and finds-or-creates the matching user. Google's own
 * email_verified claim is trusted directly - no separate verification email
 * needed for this path. If an email/password account already exists with
 * the same (Google-confirmed) address, this links to it rather than
 * creating a duplicate, so either sign-in method reaches the same account.
 */
export async function googleSignIn(idToken: string) {
  if (!googleClient) throw new ConflictError('Google sign-in is not configured');

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new UnauthorizedError('Invalid Google sign-in token');
  }
  if (!payload?.email || !payload.email_verified) {
    throw new UnauthorizedError('Google did not confirm this email address');
  }
  const { sub: googleId, email, name } = payload;

  const existingByGoogleId = await prisma.user.findUnique({ where: { googleId } });
  if (existingByGoogleId) {
    return { user: toPublicUser(existingByGoogleId), token: signToken(existingByGoogleId.id) };
  }

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  const user = existingByEmail
    ? await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { googleId, emailVerified: true }
      })
    : await prisma.user.create({
        data: { email, googleId, name: name ?? null, emailVerified: true }
      });

  return { user: toPublicUser(user), token: signToken(user.id) };
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  return toPublicUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  if (!user.passwordHash) {
    throw new ConflictError('This account signs in with Google and has no password to change');
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function updateAppMode(userId: string, appMode: 'TASK_MANAGER' | 'MINDFLOW' | 'BOTH') {
  const user = await prisma.user.update({ where: { id: userId }, data: { appMode } });
  return toPublicUser(user);
}
