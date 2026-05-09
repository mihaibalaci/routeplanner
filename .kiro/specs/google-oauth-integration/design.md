# Design Document: Google OAuth Integration

## Architecture Overview

This feature adds a server-side Google OAuth 2.0 authorization code flow to the existing authentication system. The backend reads credentials from the Google client secret JSON file at startup, exposes two new GET endpoints (`/auth/google` for redirect and `/auth/google/callback` for code exchange), and reuses the existing `ssoService.handleSsoLogin()` logic for user upsert. The frontend adds a "Sign in with Google" button that triggers a full-page navigation to the redirect endpoint, and a callback handler that captures the JWT from the redirect URL.

### Data Flow

```
┌─────────────────────────┐
│  LoginPage (Frontend)   │
│  "Sign in with Google"  │
└────────┬────────────────┘
         │ Full-page navigation: GET /api/v1/auth/google
         ▼
┌─────────────────────────────┐
│  GET /api/v1/auth/google    │
│  (OAuth Redirect Endpoint)  │
├─────────────────────────────┤
│  1. Generate random state   │
│  2. Store state in memory   │
│  3. 302 → Google Consent    │
└────────┬────────────────────┘
         │ User authorizes on Google
         ▼
┌──────────────────────────────────────┐
│  GET /api/v1/auth/google/callback    │
│  (OAuth Callback Endpoint)           │
├──────────────────────────────────────┤
│  1. Validate state (CSRF)            │
│  2. Exchange code for tokens         │──▶ Google Token Endpoint
│  3. Verify ID token, extract claims  │
│  4. Upsert user (ssoService)         │──▶ PostgreSQL
│  5. Set google_id on user record     │
│  6. Issue JWT (24h expiry)           │
│  7. 302 → /#/auth/callback?token=X  │
└──────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Frontend Callback Handler  │
│  Store JWT → localStorage   │
│  Navigate → home page       │
└─────────────────────────────┘
```

## Components

### Backend

#### 1. `src/services/credentialLoader.ts` (NEW)

Responsible for reading the Google client secret JSON file at startup and setting environment variables. Handles missing/unreadable files gracefully by logging a warning and skipping OAuth setup.

#### 2. `src/routes/authGoogle.ts` (NEW)

Contains the two new GET route handlers:
- `GET /auth/google` — Generates state, stores it, redirects to Google consent screen
- `GET /auth/google/callback` — Validates state, exchanges code, upserts user, issues JWT, redirects to frontend

#### 3. `src/services/googleOAuthService.ts` (NEW)

Encapsulates the server-side OAuth logic:
- Building the Google authorization URL with required parameters
- Exchanging the authorization code for tokens via Google's token endpoint
- Verifying the ID token and extracting user claims (email, name, sub)

#### 4. `src/services/oauthStateStore.ts` (NEW)

A short-lived in-memory store (Map with TTL) for CSRF state values. Each state entry expires after 10 minutes.

#### 5. `src/services/ssoService.ts` (MODIFIED)

Extended to also set `google_id` on the user record when the provider is `google`.

#### 6. `src/middleware/auth.ts` (MODIFIED)

The `PUBLIC_PATHS` array already includes `/auth/google`. The callback path `/auth/google/callback` is covered by the prefix match on `/auth/google`. No changes needed.

#### 7. `migrations/1700000003000_add-google-id.js` (NEW)

Adds a nullable `google_id` column with a unique index to the `users` table.

### Frontend

#### 8. `frontend/src/pages/LoginPage.ts` (MODIFIED)

The existing Google button click handler is updated to navigate to `/api/v1/auth/google` instead of showing an error message.

#### 9. `frontend/src/pages/AuthCallbackPage.ts` (NEW)

Handles the `/#/auth/callback` route. Extracts `token` or `error` from query parameters, stores the token in localStorage, and navigates accordingly.

## Interfaces

### Credential File Structure

```typescript
/**
 * Structure of the Google OAuth client secret JSON file.
 */
export interface GoogleCredentialFile {
  web: {
    client_id: string;
    client_secret: string;
    project_id: string;
    auth_uri: string;
    token_uri: string;
    redirect_uris: string[];
  };
}
```

### OAuth State Store

```typescript
export interface OAuthStateEntry {
  value: string;
  createdAt: number;
}

export interface OAuthStateStore {
  /** Generate and store a new random state value. Returns the state string. */
  create(): string;
  /** Validate and consume a state value. Returns true if valid, false otherwise. */
  validate(state: string): boolean;
}
```

### Google OAuth Service

```typescript
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface GoogleUserClaims {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * Builds the Google authorization URL with all required parameters.
 */
export function buildAuthorizationUrl(config: GoogleOAuthConfig, state: string): string;

/**
 * Exchanges an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string
): Promise<GoogleTokenResponse>;

/**
 * Verifies the ID token and extracts user claims.
 */
export async function verifyAndExtractClaims(
  idToken: string,
  clientId: string
): Promise<GoogleUserClaims>;
```

### Credential Loader

```typescript
/**
 * Loads Google OAuth credentials from the client secret JSON file.
 * Sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.
 * Returns true if credentials were loaded successfully, false otherwise.
 */
export function loadGoogleCredentials(projectRoot: string): boolean;
```

### Route Handler Types

```typescript
export interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

export interface AuthCallbackRedirectParams {
  token?: string;
  error?: string;
}
```

## Data Models

### Database Migration: `google_id` Column

```sql
-- Up
ALTER TABLE users ADD COLUMN google_id VARCHAR(255);
CREATE UNIQUE INDEX idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;

-- Down
DROP INDEX IF EXISTS idx_users_google_id;
ALTER TABLE users DROP COLUMN IF EXISTS google_id;
```

### Modified `users` Table Schema

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| google_id | varchar(255) | YES | Google `sub` value, unique partial index |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Credential file missing/unreadable | Log warning, OAuth endpoints return 503 "Google OAuth not configured" |
| GET /auth/google without credentials loaded | 503 with message "Google OAuth not configured" |
| Callback with missing `code` param | 400 with error message |
| Callback with missing/invalid `state` param | 403 with CSRF error message |
| Google token exchange failure (network/4xx/5xx) | Redirect to `/#/auth/callback?error=google_auth_failed` |
| ID token verification failure | Redirect to `/#/auth/callback?error=google_auth_failed` |
| Database error during user upsert | 500 internal server error |
| State expired (>10 min) | 403 with CSRF error message |

## Key Design Decisions

1. **Reuse existing `ssoService.handleSsoLogin()`**: The account linking logic (check auth_identity → check email match → create new user) is already implemented and tested. The new OAuth flow calls the same function with `provider='google'` and the extracted `sub` as `providerUserId`.

2. **In-memory state store with TTL**: For simplicity, CSRF state values are stored in a `Map` with a 10-minute TTL. This avoids adding Redis complexity for a short-lived value. In a multi-instance deployment, this could be moved to Redis, but the current single-server architecture doesn't require it.

3. **Full-page navigation for OAuth initiation**: The "Sign in with Google" button triggers `window.location.href = '/api/v1/auth/google'` rather than an AJAX call. This is required because the OAuth flow involves browser redirects to Google's domain and back.

4. **JWT delivered via redirect URL fragment**: After successful authentication, the JWT is passed back to the SPA via `/#/auth/callback?token=<JWT>`. This keeps the token in the URL fragment (not sent to the server on subsequent requests) and allows the SPA router to handle it.

5. **`google_id` column on users table**: While `auth_identities` already stores the provider link, a denormalized `google_id` column on `users` enables fast lookups without a JOIN. The unique partial index ensures no two users share the same Google account.

6. **Credential loading from JSON file**: Rather than requiring manual `.env` configuration of `client_secret`, the backend reads it directly from the Google-provided JSON file. This matches the developer workflow of downloading the file from Google Cloud Console.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Credential file parsing round-trip

*For any* valid Google credential JSON file containing a `web.client_id` and `web.client_secret`, loading the file SHALL result in `process.env.GOOGLE_CLIENT_ID` equaling the `client_id` value and `process.env.GOOGLE_CLIENT_SECRET` equaling the `client_secret` value from the file.

**Validates: Requirements 1.1, 1.2**

### Property 2: Client secret never appears in API responses

*For any* API endpoint response body (as a serialized string), the response SHALL NOT contain the value of `GOOGLE_CLIENT_SECRET`.

**Validates: Requirements 1.4**

### Property 3: Authorization redirect URL contains all required parameters

*For any* OAuth configuration (clientId, redirectUri) and any generated state value, the built authorization URL SHALL contain query parameters `client_id` matching the configured value, `redirect_uri` matching the configured value, `response_type=code`, `scope=openid email profile`, and `state` matching the generated value.

**Validates: Requirements 2.2**

### Property 4: State values are unique across requests

*For any* two calls to the state store's `create()` method, the returned state values SHALL be different.

**Validates: Requirements 2.3**

### Property 5: CSRF state validation rejects mismatched values

*For any* state value that was not previously created by the state store, calling `validate()` with that value SHALL return false.

**Validates: Requirements 3.6**

### Property 6: ID token claim extraction preserves fields

*For any* valid ID token payload containing `sub`, `email`, and `name` fields, the extraction function SHALL return an object where `sub`, `email`, and `name` match the original payload values exactly.

**Validates: Requirements 3.2**

### Property 7: Account linking does not duplicate existing users

*For any* Google user whose email matches an existing user record, after the upsert operation, the total count of user records with that email SHALL remain exactly one.

**Validates: Requirements 5.2**

### Property 8: New user creation sets password_hash to NULL

*For any* Google user whose email does not match any existing user record, after the upsert operation, the newly created user record SHALL have `password_hash` set to NULL and `display_name` derived from the Google profile name.

**Validates: Requirements 5.3**

### Property 9: Auth identity correctly stored for Google provider

*For any* Google user with a given `sub` value, after the upsert operation, the `auth_identities` table SHALL contain exactly one record with `provider='google'` and `provider_user_id` equal to the `sub` value, linked to the correct user.

**Validates: Requirements 5.1, 5.4**

### Property 10: Google ID stored on user record matches sub

*For any* Google user with a given `sub` value, after the upsert operation, the corresponding user record's `google_id` column SHALL equal the `sub` value.

**Validates: Requirements 6.3**

### Property 11: JWT issued by OAuth flow is accepted by auth middleware

*For any* JWT issued by the OAuth callback endpoint, passing that token in an `Authorization: Bearer <token>` header to the auth middleware SHALL result in successful authentication with `req.userId` matching the user's ID.

**Validates: Requirements 7.2, 3.4**

### Property 12: Frontend callback stores token in localStorage

*For any* JWT string present as the `token` query parameter in the `/#/auth/callback` URL, after the callback handler processes it, `localStorage.getItem('token')` SHALL return that exact JWT string.

**Validates: Requirements 4.3**

### Property 13: Frontend callback displays error message

*For any* non-empty error string present as the `error` query parameter in the `/#/auth/callback` URL, after the callback handler processes it, the rendered page SHALL contain that error string.

**Validates: Requirements 4.4**

### Property 14: Redirect URI consistency between authorization and token exchange

*For any* value of the `GOOGLE_OAUTH_REDIRECT_URI` environment variable, both the authorization redirect URL and the token exchange request SHALL use that exact value as the `redirect_uri` parameter.

**Validates: Requirements 8.3**
