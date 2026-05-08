# Requirements Document

## Introduction

This feature adds email/password registration as an additional authentication method to the Route Planner application. Currently, the application supports Google OAuth for authentication. This feature enables users to create accounts using their own email address and a password, with email confirmation required before login is permitted.

## Glossary

- **Registration_Service**: The backend service responsible for handling user account creation via email and password
- **Email_Validator**: The component that validates email format and uniqueness
- **Password_Validator**: The component that enforces password strength rules
- **Confirmation_Service**: The service responsible for generating, sending, and verifying email confirmation tokens
- **Auth_Service**: The service responsible for authenticating users and issuing JWT tokens
- **Registration_Form**: The frontend form component where users enter their registration details
- **User**: A person interacting with the Route Planner application

## Requirements

### Requirement 1: User Registration via Email

**User Story:** As a user, I want to register for an account using my email address and a password, so that I can access the Route Planner without needing a Google account.

#### Acceptance Criteria

1. WHEN a user submits a registration request with an email that matches a standard email format, a password that is at least 8 characters long and contains at least one uppercase letter, one lowercase letter, and one digit, and a display name between 1 and 100 characters, THE Registration_Service SHALL create a new user account, store the email in lowercase, and return a 201 status with the user information (excluding password hash)
2. WHEN a user submits a registration request with a missing email, password, or display name, THE Registration_Service SHALL return a 400 status with a message identifying the missing fields
3. IF a user submits a registration request with an email that does not match a standard email format, or a password that does not meet the strength requirements, or a display name that exceeds 100 characters, THEN THE Registration_Service SHALL return a 400 status with a message identifying each validation error
4. WHEN a user submits a registration request with an email already associated with an existing account (case-insensitive comparison), THE Registration_Service SHALL return a 409 status with a message indicating the email is already registered
5. THE Registration_Service SHALL store the password as a bcrypt hash with a cost factor of 12

### Requirement 2: Password Strength Validation

**User Story:** As a user, I want clear password requirements during registration, so that I can create a secure account.

#### Acceptance Criteria

1. WHEN a user submits a password shorter than 8 characters, THE Password_Validator SHALL reject the registration and display an error message indicating the password must be at least 8 characters long
2. WHEN a user submits a password without at least one uppercase letter, THE Password_Validator SHALL reject the registration and display an error message indicating an uppercase letter is required
3. WHEN a user submits a password without at least one lowercase letter, THE Password_Validator SHALL reject the registration and display an error message indicating a lowercase letter is required
4. WHEN a user submits a password without at least one digit, THE Password_Validator SHALL reject the registration and display an error message indicating a digit is required
5. WHEN a user submits a password that violates multiple rules, THE Password_Validator SHALL return all applicable error messages in a single response
6. WHEN a user submits a password longer than 128 characters, THE Password_Validator SHALL reject the registration and display an error message indicating the password must not exceed 128 characters
7. WHEN a user submits a password that meets all validation rules, THE Password_Validator SHALL accept the password and allow registration to proceed

### Requirement 3: Email Format Validation

**User Story:** As a user, I want immediate feedback if my email format is invalid, so that I can correct it before submitting.

#### Acceptance Criteria

1. WHEN a user submits an email that does not match the pattern `local@domain.tld` or exceeds 254 characters in total length, THE Email_Validator SHALL reject the registration and display an error message indicating the specific format violation detected
2. WHEN the user triggers form submission, THE Registration_Form SHALL perform client-side email format validation and display the validation error within 1 second, before sending any request to the server
3. WHEN a valid email address is received for registration, THE Registration_Service SHALL normalize the email address to lowercase and trim leading and trailing whitespace before storage
4. IF a registration request arrives at the server with an email that does not match the pattern `local@domain.tld` or exceeds 254 characters, THEN THE Registration_Service SHALL reject the request with an error message indicating the email format is invalid

### Requirement 4: Email Confirmation

**User Story:** As a user, I want to confirm my email address after registration, so that my account is verified and secure.

#### Acceptance Criteria

1. WHEN a user account is successfully created, THE Confirmation_Service SHALL generate a unique confirmation token with an expiration time of 24 hours and send a confirmation email to the registered address within 30 seconds of account creation
2. WHEN a user visits the confirmation link with a valid, unexpired, and previously unused token, THE Confirmation_Service SHALL mark the email as confirmed and return a 200 status with a message indicating successful email verification
3. IF a user visits the confirmation link with a token that is malformed, expired, or has already been used, THEN THE Confirmation_Service SHALL return a 400 status with an error message indicating the specific reason for failure (malformed, expired, or already used)
4. IF the confirmation email fails to send during registration, THEN THE Registration_Service SHALL still complete the registration successfully and allow the user to request a new confirmation email
5. WHILE a user's email is unconfirmed, THE Auth_Service SHALL reject login attempts with a 403 status and a message instructing the user to confirm their email
6. WHEN a user with an unconfirmed email requests a new confirmation email, THE Confirmation_Service SHALL invalidate any previously issued token, generate a new token with a 24-hour expiration, and send a new confirmation email to the registered address, limited to a maximum of 5 resend requests per hour

### Requirement 5: Client-Side Registration Form

**User Story:** As a user, I want a clear and responsive registration form, so that I can easily create my account.

#### Acceptance Criteria

1. THE Registration_Form SHALL display input fields for display name, email, and password
2. THE Registration_Form SHALL validate that all fields contain at least one non-whitespace character before submission
3. IF the password is fewer than 8 characters, does not contain at least one uppercase letter, does not contain at least one lowercase letter, or does not contain at least one digit, THEN THE Registration_Form SHALL display a validation error message indicating the specific unmet rule without submitting to the server
4. WHEN the registration request is in progress, THE Registration_Form SHALL disable the submit button and display a visible loading indicator
5. WHEN the server returns an error, THE Registration_Form SHALL display the server-provided error message to the user
6. WHEN registration succeeds, THE Registration_Form SHALL redirect the user to the login page
7. THE Registration_Form SHALL constrain the display name field to a maximum of 100 characters and the email field to a maximum of 254 characters

### Requirement 6: Account Lockout Protection

**User Story:** As a user, I want my account protected from brute-force attacks, so that unauthorized access is prevented.

#### Acceptance Criteria

1. WHEN a user fails to log in 5 times consecutively within a 60-minute sliding window, THE Auth_Service SHALL lock the account for 30 minutes
2. WHILE an account is locked, THE Auth_Service SHALL reject login attempts with a 423 status and a message indicating the account is temporarily locked
3. WHEN a user logs in successfully, THE Auth_Service SHALL reset the failed login attempt counter to zero
4. WHEN the 30-minute lockout period expires, THE Auth_Service SHALL unlock the account and reset the failed login attempt counter to zero

### Requirement 7: Navigation Between Auth Pages

**User Story:** As a user, I want to easily navigate between login and registration pages, so that I can access the correct form.

#### Acceptance Criteria

1. THE Registration_Form SHALL display a visible link labeled "Log In" that navigates the user to the Login page without a full page reload
2. THE Login page SHALL display a visible link labeled "Register" that navigates the user to the Registration_Form without a full page reload
3. WHEN the user clicks a navigation link on either auth page, THE System SHALL display the target auth page within 1 second while preserving the browser history so the back button returns to the previous page
