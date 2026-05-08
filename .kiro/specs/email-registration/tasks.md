# Implementation Plan: Email Registration

## Overview

Implement email/password registration for the Route Planner application. This builds on existing backend services (`userService.ts`, `authService.ts`, `emailService.ts`) and frontend pages (`RegisterPage.ts`, `LoginPage.ts`). The work focuses on adding missing validations, the resend-confirmation endpoint, sliding-window lockout logic, and enhanced frontend form behavior.

## Tasks

- [x] 1. Enhance validation functions in userService
  - [x] 1.1 Add max-length checks to validatePassword and validateEmail, and create validateDisplayName
    - Add `password.length > 128` check to `validatePassword` in `src/services/userService.ts`
    - Add `email.length > 254` check to `validateEmail` in `src/services/userService.ts`
    - Create `validateDisplayName` function: required, trimmed length 1–100 characters
    - Export `validateDisplayName` from `src/services/userService.ts`
    - _Requirements: 2.6, 3.1, 3.4, 1.3_

  - [x] 1.2 Write property tests for validatePassword (Properties 1 and 2)
    - **Property 1: Password validation rejects all invalid passwords**
    - **Property 2: Password validation accepts all valid passwords**
    - Use `fast-check` to generate arbitrary strings violating/satisfying password rules
    - Add tests to `src/services/userService.test.ts`
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

  - [x] 1.3 Write property tests for validateEmail (Property 3)
    - **Property 3: Email validation rejects all invalid emails**
    - Use `fast-check` to generate strings that fail the email regex or exceed 254 chars
    - Add tests to `src/services/userService.test.ts`
    - **Validates: Requirements 3.1, 3.4**

  - [x] 1.4 Write property test for email normalization (Property 4)
    - **Property 4: Email normalization is idempotent**
    - Verify that `email.toLowerCase().trim()` applied twice yields the same result
    - Add tests to `src/services/userService.test.ts`
    - **Validates: Requirements 3.3**

- [x] 2. Enhance registration route and add resend-confirmation endpoint
  - [x] 2.1 Update POST /register to validate display name and aggregate all errors
    - Call `validateDisplayName` in `src/routes/auth.ts` register handler
    - Collect errors from email, password, and display name validators into a single response
    - Return all validation errors in the `errors` array (not just the first one)
    - _Requirements: 1.2, 1.3, 2.5, 5.7_

  - [x] 2.2 Enhance GET /confirm/:token to differentiate error messages
    - Update `src/services/emailService.ts` `confirmEmail` to return specific failure reasons: malformed, expired, or already used
    - Update `src/routes/auth.ts` confirm handler to return the specific error message
    - _Requirements: 4.2, 4.3_

  - [x] 2.3 Implement POST /api/v1/auth/resend-confirmation endpoint
    - Create new route in `src/routes/auth.ts`
    - Accept `{ email: string }` in request body
    - Look up user by email; return 200 generically (don't reveal if email exists for security, or return 404 per design — follow design: 404 if not found)
    - Check rate limit: count tokens created in last hour for user, reject with 429 if >= 5
    - Invalidate existing unused tokens for the user (mark as used)
    - Generate new token and send confirmation email
    - _Requirements: 4.4, 4.6_

  - [x] 2.4 Write property test for token uniqueness (Property 8)
    - **Property 8: Confirmation tokens are unique**
    - Generate multiple tokens and assert all are distinct
    - Add tests to `src/services/emailService.test.ts`
    - **Validates: Requirements 4.1**

  - [x] 2.5 Write unit tests for resend-confirmation rate limiting and token invalidation
    - Test that 6th resend within an hour returns 429
    - Test that previous token is invalidated after resend
    - **Property 9: Resend invalidates previous tokens**
    - Add tests to `src/routes/auth.test.ts`
    - **Validates: Requirements 4.6**

- [x] 3. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement sliding-window lockout logic in authService
  - [x] 4.1 Add sliding-window failed attempt tracking
    - Update `src/services/authService.ts` `handleFailedAttempt` to only count failures within the last 60 minutes
    - Add `last_failed_at` timestamp update on each failed attempt, or use timestamp-based query to count recent failures
    - Reset counter when lockout expires (time-based, not just on successful login)
    - _Requirements: 6.1, 6.4_

  - [x] 4.2 Write property test for unconfirmed user login rejection (Property 6)
    - **Property 6: Unconfirmed users cannot login**
    - For any user with `email_confirmed = false`, login SHALL return 403
    - Add tests to `src/services/authService.test.ts`
    - **Validates: Requirements 4.5**

  - [x] 4.3 Write property test for locked account login rejection (Property 7)
    - **Property 7: Locked accounts cannot login**
    - For any user with `locked_until` in the future, login SHALL return 423
    - Add tests to `src/services/authService.test.ts`
    - **Validates: Requirements 6.2**

  - [x] 4.4 Write unit tests for sliding-window lockout behavior
    - Test that 5 failures within 60 minutes triggers lockout
    - Test that failures older than 60 minutes are not counted
    - Test that successful login resets the counter
    - Test that lockout expiry allows login again
    - Add tests to `src/services/authService.test.ts`
    - _Requirements: 6.1, 6.3, 6.4_

- [x] 5. Enhance frontend RegisterPage
  - [x] 5.1 Add email format validation and maxlength attributes to RegisterPage
    - Add `maxlength="254"` to email input and `maxlength="100"` to display name input in `frontend/src/pages/RegisterPage.ts`
    - Add client-side email format validation (regex check) before form submission
    - Show all password validation errors at once instead of one at a time
    - _Requirements: 3.2, 5.2, 5.3, 5.7_

  - [x] 5.2 Improve loading state and server error display in RegisterPage
    - Disable submit button and show spinner during request (already partially done, verify it works without full re-render losing input values)
    - Display server-provided error messages from the `errors` array
    - Handle 409 with a specific "already registered" message and link to login
    - _Requirements: 5.4, 5.5, 5.6_

  - [x] 5.3 Write unit tests for RegisterPage form validation and UI behavior
    - Test that all fields are present with correct attributes
    - Test client-side validation shows all errors
    - Test loading state disables button
    - Test navigation link to login page is present
    - Add tests to `frontend/src/pages/RegisterPage.test.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integration wiring and duplicate email property test
  - [x] 7.1 Verify end-to-end registration → confirmation → login flow
    - Write integration test using `supertest` that registers a user, confirms email via token, then logs in successfully
    - Test that login before confirmation returns 403
    - Add to `src/routes/auth.test.ts`
    - _Requirements: 1.1, 4.2, 4.5_

  - [x] 7.2 Write property test for case-insensitive duplicate detection (Property 5)
    - **Property 5: Duplicate email detection is case-insensitive**
    - Register with an email, then attempt registration with a case variation — expect 409
    - Add to `src/routes/auth.test.ts`
    - **Validates: Requirements 1.4**

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project already has `fast-check` (v3.23.2) and `vitest` configured
- Existing code in `userService.ts`, `authService.ts`, and `emailService.ts` provides the foundation — tasks focus on enhancements and missing pieces
- The `confirmation_tokens` table and `email_confirmed` column already exist via migration `1700000002000_add-email-confirmation.js`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "5.2"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.2", "4.3", "4.4", "5.3"] },
    { "id": 4, "tasks": ["7.1", "7.2"] }
  ]
}
```
