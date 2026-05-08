/**
 * Email Service — SMTP transport using nodemailer.
 * Configuration via environment variables:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
import nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';
import { query } from '../utils/database';

// Token expiry: 24 hours
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Create the nodemailer transporter from env vars.
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });
}

/**
 * Generate a unique confirmation token and store it in the database.
 */
export async function generateConfirmationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  await query(
    `INSERT INTO confirmation_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt.toISOString()]
  );

  return token;
}

/**
 * Send a confirmation email to the user.
 */
export async function sendConfirmationEmail(
  email: string,
  token: string
): Promise<void> {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  const confirmUrl = `${baseUrl}/api/v1/auth/confirm/${token}`;
  const from = process.env.SMTP_FROM || 'noreply@routeplanner.app';

  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Confirm your Route Planner account',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#1e293b;">Welcome to Route Planner!</h2>
        <p style="color:#64748b;line-height:1.6;">
          Please confirm your email address by clicking the button below.
          This link expires in 24 hours.
        </p>
        <a href="${confirmUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
          Confirm Email
        </a>
        <p style="color:#94a3b8;font-size:14px;margin-top:24px;">
          If you didn't create this account, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Welcome to Route Planner! Confirm your email: ${confirmUrl}`,
  });
}

/**
 * Count how many confirmation tokens were created in the last hour for a user.
 * Used for rate-limiting resend requests.
 */
export async function countRecentTokens(userId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count FROM confirmation_tokens
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Invalidate all unused confirmation tokens for a user by marking them as used.
 */
export async function invalidateExistingTokens(userId: string): Promise<void> {
  await query(
    `UPDATE confirmation_tokens SET used = true WHERE user_id = $1 AND used = false`,
    [userId]
  );
}

export interface ConfirmEmailResult {
  success: boolean;
  userId?: string;
  reason?: 'malformed' | 'expired' | 'already_used';
}

/**
 * Verify a confirmation token and mark the user's email as confirmed.
 * Returns a result object with success status and failure reason if applicable.
 */
export async function confirmEmail(token: string): Promise<ConfirmEmailResult> {
  const result = await query(
    `SELECT ct.id, ct.user_id, ct.expires_at, ct.used
     FROM confirmation_tokens ct
     WHERE ct.token = $1`,
    [token]
  );

  if (result.rows.length === 0) {
    return { success: false, reason: 'malformed' };
  }

  const row = result.rows[0];

  // Check if already used
  if (row.used) {
    return { success: false, reason: 'already_used' };
  }

  // Check if expired
  if (new Date(row.expires_at) < new Date()) {
    return { success: false, reason: 'expired' };
  }

  // Mark token as used
  await query(
    `UPDATE confirmation_tokens SET used = true WHERE id = $1`,
    [row.id]
  );

  // Mark user email as confirmed
  await query(
    `UPDATE users SET email_confirmed = true, updated_at = NOW() WHERE id = $1`,
    [row.user_id]
  );

  return { success: true, userId: row.user_id };
}
