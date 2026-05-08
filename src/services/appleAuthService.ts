import appleSignin, {
  AppleIdTokenType,
  AppleAuthorizationTokenResponseType,
} from 'apple-signin-auth';

export interface AppleUserPayload {
  appleUserId: string;
  email: string;
  isPrivateEmail: boolean;
}

/**
 * Generates the Apple client secret JWT used for token exchange.
 * Uses APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY env vars.
 */
function getAppleClientSecret(): string {
  const clientID = process.env.APPLE_CLIENT_ID;
  const teamID = process.env.APPLE_TEAM_ID;
  const keyIdentifier = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;

  if (!clientID || !teamID || !keyIdentifier || !privateKey) {
    throw new Error(
      'Missing Apple SSO configuration. Required: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY'
    );
  }

  return appleSignin.getClientSecret({
    clientID,
    teamID,
    keyIdentifier,
    // The private key may have escaped newlines in env vars
    privateKey: privateKey.replace(/\\n/g, '\n'),
  });
}

/**
 * Exchanges an Apple authorization code for tokens and verifies the ID token.
 * Returns the verified user payload with Apple user ID and email.
 *
 * @param authCode - The authorization code from Apple's Sign in flow
 * @returns Verified Apple user payload
 * @throws Error if verification fails
 */
export async function verifyAppleToken(authCode: string): Promise<AppleUserPayload> {
  const clientID = process.env.APPLE_CLIENT_ID;
  const redirectUri = process.env.APPLE_REDIRECT_URI || 'https://localhost/auth/apple/callback';

  if (!clientID) {
    throw new Error('Missing APPLE_CLIENT_ID environment variable');
  }

  const clientSecret = getAppleClientSecret();

  // Exchange auth code for tokens
  let tokenResponse: AppleAuthorizationTokenResponseType;
  try {
    tokenResponse = await appleSignin.getAuthorizationToken(authCode, {
      clientID,
      redirectUri,
      clientSecret,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const error = new Error(`Apple token exchange failed: ${message}`);
    (error as any).statusCode = 401;
    throw error;
  }

  if (!tokenResponse.id_token) {
    const error = new Error('Apple token exchange did not return an ID token');
    (error as any).statusCode = 401;
    throw error;
  }

  // Verify the ID token
  let idTokenPayload: AppleIdTokenType;
  try {
    idTokenPayload = await appleSignin.verifyIdToken(tokenResponse.id_token, {
      audience: clientID,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const error = new Error(`Apple ID token verification failed: ${message}`);
    (error as any).statusCode = 401;
    throw error;
  }

  if (!idTokenPayload.sub) {
    const error = new Error('Apple ID token missing user identifier');
    (error as any).statusCode = 401;
    throw error;
  }

  if (!idTokenPayload.email) {
    const error = new Error('Apple ID token missing email');
    (error as any).statusCode = 401;
    throw error;
  }

  return {
    appleUserId: idTokenPayload.sub,
    email: idTokenPayload.email,
    isPrivateEmail:
      idTokenPayload.is_private_email === 'true' ||
      idTokenPayload.is_private_email === true,
  };
}
