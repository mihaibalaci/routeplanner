import jwt from 'jsonwebtoken';
import { query, transaction } from '../utils/database';
import { User, UserResponse, toUserResponse } from '../models/user';
import { findByEmail } from './userService';
import { verifyGoogleToken } from './googleAuthService';
import { verifyAppleToken } from './appleAuthService';

const JWT_EXPIRY_SECONDS = 86400; // 24 hours

export interface AuthResult {
  token: string;
  expiresIn: number;
  user: UserResponse;
}

interface AuthIdentity {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  provider_email: string | null;
  created_at: Date;
}

/**
 * Issues a JWT token for the given user with 24h expiry.
 */
function issueToken(user: User): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  return jwt.sign(
    { userId: user.id, email: user.email },
    secret,
    { expiresIn: JWT_EXPIRY_SECONDS }
  );
}

/**
 * Finds an auth_identity record by provider and provider_user_id.
 */
async function findAuthIdentity(
  provider: string,
  providerUserId: string
): Promise<AuthIdentity | null> {
  const result = await query(
    'SELECT * FROM auth_identities WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerUserId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as AuthIdentity;
}

/**
 * Creates a new user without a password (SSO-only user).
 */
async function createSsoUser(
  email: string,
  displayName: string,
  client?: any
): Promise<User> {
  const queryFn = client ? client.query.bind(client) : query;
  const result = await queryFn(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, NULL, $2)
     RETURNING *`,
    [email.toLowerCase().trim(), displayName.trim()]
  );

  return result.rows[0] as User;
}

/**
 * Creates an auth_identity record linking a provider to a user.
 */
async function createAuthIdentity(
  userId: string,
  provider: string,
  providerUserId: string,
  providerEmail: string | null,
  client?: any
): Promise<AuthIdentity> {
  const queryFn = client ? client.query.bind(client) : query;
  const result = await queryFn(
    `INSERT INTO auth_identities (user_id, provider, provider_user_id, provider_email)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, provider, providerUserId, providerEmail]
  );

  return result.rows[0] as AuthIdentity;
}

/**
 * Finds a user by their ID.
 */
async function findUserById(userId: string): Promise<User | null> {
  const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as User;
}

/**
 * Shared SSO login logic:
 * 1. Check if auth_identity exists for this provider user ID → if yes, find linked user, issue JWT
 * 2. If no auth_identity, check if user with same email exists → link SSO identity to existing account
 * 3. If no user exists, create new user (no password) and create auth_identity
 * 4. Issue JWT with 24h expiry
 */
async function handleSsoLogin(
  provider: string,
  providerUserId: string,
  email: string,
  displayName: string
): Promise<AuthResult> {
  // Step 1: Check if auth_identity already exists
  const existingIdentity = await findAuthIdentity(provider, providerUserId);

  if (existingIdentity) {
    const user = await findUserById(existingIdentity.user_id);
    if (!user) {
      const error = new Error('Linked user account not found');
      (error as any).statusCode = 401;
      throw error;
    }

    const token = issueToken(user);
    return {
      token,
      expiresIn: JWT_EXPIRY_SECONDS,
      user: toUserResponse(user),
    };
  }

  // Step 2: Check if a user with the same email exists
  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await findByEmail(normalizedEmail);

  if (existingUser) {
    // Link SSO identity to existing account
    await createAuthIdentity(existingUser.id, provider, providerUserId, normalizedEmail);

    const token = issueToken(existingUser);
    return {
      token,
      expiresIn: JWT_EXPIRY_SECONDS,
      user: toUserResponse(existingUser),
    };
  }

  // Step 3: Create new user and link identity
  const user = await transaction(async (client) => {
    const newUser = await createSsoUser(normalizedEmail, displayName, client);
    await createAuthIdentity(newUser.id, provider, providerUserId, normalizedEmail, client);
    return newUser;
  });

  const token = issueToken(user);
  return {
    token,
    expiresIn: JWT_EXPIRY_SECONDS,
    user: toUserResponse(user),
  };
}

/**
 * Handles Google SSO login flow:
 * 1. Verify the Google ID token
 * 2. Use shared SSO linking logic
 *
 * @param idToken - The Google ID token from the client
 */
export async function handleGoogleLogin(idToken: string): Promise<AuthResult> {
  const googleUser = await verifyGoogleToken(idToken);

  return handleSsoLogin(
    'google',
    googleUser.googleUserId,
    googleUser.email,
    googleUser.name
  );
}

/**
 * Handles Apple SSO login flow:
 * 1. Verify the Apple auth code / token
 * 2. Use shared SSO linking logic
 *
 * Apple only sends user info (name, email) on the first login.
 * On subsequent logins, we rely on the verified token payload.
 *
 * @param authCode - The authorization code from Apple's Sign in flow
 * @param userInfo - Optional user info (Apple only sends this on first login)
 */
export async function handleAppleLogin(
  authCode: string,
  userInfo?: { email?: string; name?: string }
): Promise<AuthResult> {
  let applePayload;
  try {
    applePayload = await verifyAppleToken(authCode);
  } catch (err: unknown) {
    if (err instanceof Error && (err as any).statusCode) {
      throw err;
    }
    const error = new Error('Apple authentication failed');
    (error as any).statusCode = 401;
    throw error;
  }

  const { appleUserId, email } = applePayload;
  // Use name from userInfo if available (Apple only sends it on first login),
  // otherwise derive from email
  const displayName = userInfo?.name || email.split('@')[0];

  return handleSsoLogin('apple', appleUserId, email, displayName);
}
