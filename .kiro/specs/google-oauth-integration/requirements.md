# Requirements Document

## Introduction

Add a server-side Google OAuth 2.0 authorization code flow to the Route Planner application. The backend reads `client_id` and `client_secret` from the Google credential JSON file at startup, exposes redirect-based OAuth endpoints, and upserts users by email match. The frontend provides a "Sign in with Google" button that initiates the flow. This complements the existing client-side ID token approach with a full server-side redirect flow.

## Glossary

- **Backend**: The Express.js server application running at `/api/v1`
- **Frontend**: The single-page application served from the `frontend/` directory
- **Credential_File**: The Google OAuth client secret JSON file located at the project root (`client_secret_*.apps.googleusercontent.com.json`)
- **OAuth_Redirect_Endpoint**: The `GET /api/v1/auth/google` route that redirects the user to Google's consent screen
- **OAuth_Callback_Endpoint**: The `GET /api/v1/auth/google/callback` route that handles the authorization code exchange
- **Auth_Identities_Table**: The `auth_identities` PostgreSQL table that links SSO provider accounts to local user records
- **Users_Table**: The `users` PostgreSQL table storing user accounts
- **JWT**: A JSON Web Token issued by the Backend with a 24-hour expiry containing `userId` and `email` claims
- **Google_Consent_Screen**: Google's hosted authorization page where users grant permission to the application

## Requirements

### Requirement 1: Credential Loading

**User Story:** As a developer, I want the backend to load Google OAuth credentials from the JSON file at startup, so that secrets are never exposed to the frontend or committed as inline values.

#### Acceptance Criteria

1. WHEN the Backend starts, THE Backend SHALL read `client_id` and `client_secret` from the Credential_File located at the project root.
2. WHEN the Backend successfully reads the Credential_File, THE Backend SHALL store the `client_id` value in the `GOOGLE_CLIENT_ID` environment variable and the `client_secret` value in the `GOOGLE_CLIENT_SECRET` environment variable.
3. IF the Credential_File is missing or unreadable, THEN THE Backend SHALL log a warning message and continue startup without enabling the Google OAuth redirect flow.
4. THE Backend SHALL NOT expose `client_secret` in any API response, frontend bundle, or client-accessible resource.

### Requirement 2: OAuth Redirect Endpoint

**User Story:** As a user, I want to be redirected to Google's consent screen when I click "Sign in with Google", so that I can authorize the application with my Google account.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/v1/auth/google`, THE OAuth_Redirect_Endpoint SHALL respond with an HTTP 302 redirect to the Google_Consent_Screen.
2. THE OAuth_Redirect_Endpoint SHALL include the following query parameters in the redirect URL: `client_id`, `redirect_uri` set to the OAuth_Callback_Endpoint absolute URL, `response_type` set to `code`, `scope` set to `openid email profile`, and a `state` parameter for CSRF protection.
3. THE OAuth_Redirect_Endpoint SHALL generate a cryptographically random `state` value and associate it with the user session or a short-lived server-side store.
4. THE OAuth_Redirect_Endpoint SHALL NOT require authentication (the path is public).

### Requirement 3: OAuth Callback Endpoint

**User Story:** As a user, I want the application to complete the sign-in process after I authorize on Google, so that I receive a valid session token.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/v1/auth/google/callback` with a valid `code` and `state` parameter, THE OAuth_Callback_Endpoint SHALL exchange the authorization code for tokens by calling Google's token endpoint with `client_id`, `client_secret`, `code`, `redirect_uri`, and `grant_type` set to `authorization_code`.
2. WHEN the token exchange succeeds, THE OAuth_Callback_Endpoint SHALL verify the returned ID token to extract the user's `email`, `name`, and Google `sub` (user ID).
3. WHEN a valid Google user identity is obtained, THE OAuth_Callback_Endpoint SHALL upsert the user following the existing SSO linking logic: check Auth_Identities_Table by provider and provider_user_id, link to existing user by email match, or create a new user.
4. WHEN the user is upserted successfully, THE OAuth_Callback_Endpoint SHALL issue a JWT with the same format and expiry as the existing auth system (24-hour expiry, `userId` and `email` claims).
5. WHEN the JWT is issued, THE OAuth_Callback_Endpoint SHALL redirect the user to the frontend at `/#/auth/callback?token=<JWT>`.
6. IF the `state` parameter is missing or does not match the stored value, THEN THE OAuth_Callback_Endpoint SHALL respond with HTTP 403 and a CSRF error message.
7. IF the `code` parameter is missing, THEN THE OAuth_Callback_Endpoint SHALL respond with HTTP 400 and an error message indicating the missing authorization code.
8. IF the token exchange with Google fails, THEN THE OAuth_Callback_Endpoint SHALL redirect the user to the frontend at `/#/auth/callback?error=google_auth_failed`.

### Requirement 4: Frontend Sign-In Button

**User Story:** As a user, I want a "Sign in with Google" button on the login page, so that I can initiate the Google OAuth flow with a single click.

#### Acceptance Criteria

1. THE Frontend SHALL display a "Sign in with Google" button on the login page.
2. WHEN the user clicks the "Sign in with Google" button, THE Frontend SHALL navigate the browser to `GET /api/v1/auth/google` (full page navigation, not an AJAX request).
3. WHEN the Frontend detects a URL matching `/#/auth/callback` with a `token` query parameter, THE Frontend SHALL store the JWT in localStorage and navigate the user to the home page.
4. WHEN the Frontend detects a URL matching `/#/auth/callback` with an `error` query parameter, THE Frontend SHALL display the error message to the user on the login page.

### Requirement 5: Account Linking by Email

**User Story:** As an existing user, I want my Google account to be linked to my existing account when the email matches, so that I can sign in with either method.

#### Acceptance Criteria

1. WHEN a Google user's email matches an existing record in the Users_Table, THE OAuth_Callback_Endpoint SHALL create an entry in the Auth_Identities_Table linking the Google `sub` to the existing user record.
2. WHEN a Google user's email matches an existing record in the Users_Table, THE OAuth_Callback_Endpoint SHALL NOT create a duplicate user record.
3. WHEN a Google user's email does not match any existing record in the Users_Table, THE OAuth_Callback_Endpoint SHALL create a new user record with `password_hash` set to NULL and a display name derived from the Google profile name.
4. THE OAuth_Callback_Endpoint SHALL store the Google `sub` value as `provider_user_id` with `provider` set to `google` in the Auth_Identities_Table.

### Requirement 6: Database Migration

**User Story:** As a developer, I want a migration to add a `google_id` column to the users table, so that Google accounts can be quickly identified without joining the auth_identities table.

#### Acceptance Criteria

1. THE Backend SHALL include a new database migration that adds a nullable `google_id` column of type `varchar(255)` to the Users_Table.
2. THE migration SHALL add a unique index on the `google_id` column to prevent duplicate Google account links.
3. WHEN a Google user is upserted, THE OAuth_Callback_Endpoint SHALL set the `google_id` column on the user record to the Google `sub` value.
4. THE migration SHALL be reversible (include a down migration that removes the `google_id` column).

### Requirement 7: Auth Middleware Compatibility

**User Story:** As a developer, I want the new OAuth endpoints to be accessible without authentication, so that unauthenticated users can initiate the sign-in flow.

#### Acceptance Criteria

1. THE Backend auth middleware SHALL allow unauthenticated access to `GET /api/v1/auth/google` and `GET /api/v1/auth/google/callback`.
2. THE JWT issued by the OAuth_Callback_Endpoint SHALL be accepted by the existing auth middleware without modification.
3. THE Backend SHALL type all new endpoint request and response interfaces using TypeScript.

### Requirement 8: Environment Variable Configuration

**User Story:** As a developer, I want the Google OAuth configuration documented in the environment example file, so that other developers know which variables are required.

#### Acceptance Criteria

1. THE Backend SHALL add `GOOGLE_CLIENT_SECRET` to the `.env.example` file with a placeholder value.
2. THE Backend SHALL add `GOOGLE_OAUTH_REDIRECT_URI` to the `.env.example` file with a default value of `http://localhost:3000/api/v1/auth/google/callback`.
3. THE Backend SHALL use the `GOOGLE_OAUTH_REDIRECT_URI` environment variable as the `redirect_uri` in both the authorization URL and the token exchange request.
