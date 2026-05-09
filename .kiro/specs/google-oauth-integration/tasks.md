# Implementation Plan: Google OAuth Integration

## Overview

Add server-side Google OAuth 2.0 authorization code flow to the Route Planner. The implementation covers credential loading from the Google JSON file, two new OAuth endpoints (redirect and callback), an in-memory CSRF state store, a database migration for `google_id`, modifications to the existing SSO service, and a frontend callback handler page.

## Tasks

- [ ] 1. Database migration and credential loader
  - [ ] 1.1 Create database migration `migrations/1700000003000_add-google-id.js`
    - Add nullable `google_id` column (varchar 255) to `users` table
    - Add unique partial index `idx_users_google_id` on `google_id` WHERE `google_id IS NOT NULL`
    - Include reversible down migration that drops the index and column
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ] 1.2 Create `src/services/credentialLoader.ts`
    - Implement `loadGoogleCredentials(projectRoot: string): boolean`
    - Read the `client_secret_*.apps.googleusercontent.com.json` file from project root
    - Parse the JSON and extract `web.client_id` and `web.client_secret`
    - Set `process.env.GOOGLE_CLIENT_ID` and `process.env.GOOGLE_CLIENT_SECRET`
    - Return `false` and log a warning if file is missing or unreadable
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 1.3 Write property test for credential loader
    - **Property 1: Credential file parsing round-trip**
    - **Validates: Requirements 1.1, 1.2**

- [ ] 2. OAuth state store and Google OAuth service
  - [ ] 2.1 Create `src/services/oauthStateStore.ts`
    - Implement `OAuthStateStore` interface with `create()` and `validate()` methods
    - Use a `Map<string, OAuthStateEntry>` with 10-minute TTL
    - Generate cryptographically random state values using `crypto.randomBytes`
    - `validate()` must consume the state (single-use) and reject expired entries
    - _Requirements: 2.3, 3.6_

  - [ ]* 2.2 Write property tests for OAuth state store
    - **Property 4: State values are unique across requests**
    - **Property 5: CSRF state validation rejects mismatched values**
    - **Validates: Requirements 2.3, 3.6**

  - [ ] 2.3 Create `src/services/googleOAuthService.ts`
    - Implement `buildAuthorizationUrl(config, state): string` — builds Google auth URL with `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, and `state`
    - Implement `exchangeCodeForTokens(config, code): Promise<GoogleTokenResponse>` — POST to Google token endpoint with `client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code`
    - Implement `verifyAndExtractClaims(idToken, clientId): Promise<GoogleUserClaims>` — verify ID token using `google-auth-library` and extract `sub`, `email`, `name`
    - Export all TypeScript interfaces (`GoogleOAuthConfig`, `GoogleTokenResponse`, `GoogleUserClaims`)
    - _Requirements: 2.2, 3.1, 3.2_

  - [ ]* 2.4 Write property tests for Google OAuth service
    - **Property 3: Authorization redirect URL contains all required parameters**
    - **Property 14: Redirect URI consistency between authorization and token exchange**
    - **Validates: Requirements 2.2, 8.3**

- [ ] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Route handler and SSO service modifications
  - [ ] 4.1 Modify `src/services/ssoService.ts` to set `google_id` on user record
    - After upsert, when provider is `google`, update `users.google_id` with the `providerUserId` (Google `sub`)
    - Apply to both existing-user linking and new-user creation paths
    - _Requirements: 6.3, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 4.2 Write property tests for account linking
    - **Property 7: Account linking does not duplicate existing users**
    - **Property 8: New user creation sets password_hash to NULL**
    - **Property 9: Auth identity correctly stored for Google provider**
    - **Property 10: Google ID stored on user record matches sub**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 6.3**

  - [ ] 4.3 Create `src/routes/authGoogle.ts`
    - Implement `GET /auth/google` handler: check credentials loaded, generate state, build auth URL, respond with 302 redirect
    - Implement `GET /auth/google/callback` handler: validate state, exchange code, verify ID token, call `handleSsoLogin`, issue JWT, redirect to `/#/auth/callback?token=<JWT>`
    - Handle error cases: missing credentials (503), missing code (400), invalid state (403), Google failure (redirect with error)
    - Export router and register in the main Express app
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 4.4 Write unit tests for route handlers
    - Test 302 redirect to Google with correct URL parameters
    - Test 503 when credentials not loaded
    - Test 400 when code is missing
    - Test 403 when state is invalid
    - Test successful callback flow issues JWT and redirects
    - _Requirements: 2.1, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Frontend changes and environment configuration
  - [ ] 6.1 Update `frontend/src/pages/LoginPage.ts`
    - Change the "Sign in with Google" button click handler to navigate to `/api/v1/auth/google` via `window.location.href`
    - Remove any existing placeholder/error behavior for the Google button
    - _Requirements: 4.1, 4.2_

  - [ ] 6.2 Create `frontend/src/pages/AuthCallbackPage.ts`
    - Parse `token` and `error` query parameters from the URL
    - If `token` is present, store in `localStorage` and navigate to home page
    - If `error` is present, display error message to the user
    - _Requirements: 4.3, 4.4_

  - [ ] 6.3 Register the `AuthCallbackPage` route in the frontend router
    - Add `/#/auth/callback` route mapping in `frontend/src/main.ts` or the appropriate router file
    - _Requirements: 4.3_

  - [ ] 6.4 Update `.env.example` with OAuth environment variables
    - Add `GOOGLE_CLIENT_SECRET=your_google_client_secret_here`
    - Add `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback`
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 6.5 Write unit tests for AuthCallbackPage
    - **Property 12: Frontend callback stores token in localStorage**
    - **Property 13: Frontend callback displays error message**
    - **Validates: Requirements 4.3, 4.4**

- [ ] 7. Integration wiring and startup
  - [ ] 7.1 Wire credential loader into server startup (`src/index.ts`)
    - Call `loadGoogleCredentials()` early in the startup sequence
    - Register the `authGoogle` router on the Express app at `/api/v1/auth`
    - _Requirements: 1.1, 1.3_

  - [ ]* 7.2 Write integration test for full OAuth flow
    - **Property 11: JWT issued by OAuth flow is accepted by auth middleware**
    - **Property 2: Client secret never appears in API responses**
    - Test end-to-end: mock Google token endpoint, verify JWT is valid and accepted by auth middleware
    - **Validates: Requirements 1.4, 3.4, 7.2**

- [ ] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The project uses Vitest with fast-check for property-based testing
- The existing `handleSsoLogin()` in `ssoService.ts` handles the core upsert logic — the new flow calls it with `provider='google'`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.3", "6.4"] },
    { "id": 2, "tasks": ["2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1", "6.2"] },
    { "id": 4, "tasks": ["4.4", "6.3", "6.5"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2"] }
  ]
}
```
