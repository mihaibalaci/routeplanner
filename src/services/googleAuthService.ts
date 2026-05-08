import { OAuth2Client, TokenPayload } from 'google-auth-library';

let client: OAuth2Client | null = null;
let cachedClientId: string | undefined;

function getClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!client || cachedClientId !== clientId) {
    client = new OAuth2Client(clientId);
    cachedClientId = clientId;
  }
  return client;
}

export interface GoogleUserInfo {
  googleUserId: string;
  email: string;
  name: string;
}

/**
 * Verifies a Google ID token using Google Identity Services.
 * Extracts email, name, and Google user ID from the verified payload.
 *
 * @throws Error if token is invalid or verification fails
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is not configured');
  }

  const oauth2Client = getClient();

  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: googleClientId,
  });

  const payload: TokenPayload | undefined = ticket.getPayload();

  if (!payload) {
    throw new Error('Unable to extract payload from Google ID token');
  }

  const { sub, email, name } = payload;

  if (!sub || !email) {
    throw new Error('Google token payload missing required fields (sub, email)');
  }

  return {
    googleUserId: sub,
    email,
    name: name || email.split('@')[0],
  };
}
