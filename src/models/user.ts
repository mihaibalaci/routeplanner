/**
 * User model type definitions matching the PostgreSQL users table schema.
 */

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Subset of User fields returned in API responses (excludes sensitive data).
 */
export interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new user via registration.
 */
export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
}

/**
 * Result of a validation check.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Maps a database User row to a safe API response (no password_hash or internal fields).
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
