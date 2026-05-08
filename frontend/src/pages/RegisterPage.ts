/**
 * Register Page Component
 *
 * Provides registration form with:
 * - Email, password, display name MDL text fields
 * - Client-side password validation (8+ chars, uppercase, lowercase, digit)
 * - Inline validation error display
 * - Google SSO button
 * - Apple SSO button
 * - Link to login page
 *
 * Validates: Requirements 10.1, 10.4, 10.5, 10.11
 */

import { apiClient, ApiError } from '../api/client';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class RegisterPage {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.buildTemplate();
    this.upgradeComponents();
    this.bindEvents();
  }

  private buildTemplate(): string {
    return `
      <div class="auth-page">
        <div class="mdl-card mdl-shadow--4dp auth-card">
          <div class="mdl-card__title">
            <h2 class="mdl-card__title-text">Create Account</h2>
          </div>
          <div class="mdl-card__supporting-text auth-card__body">
            <form id="register-form" novalidate>
              <div class="auth-error" id="register-error" role="alert" aria-live="polite"></div>

              <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
                <input class="mdl-textfield__input" type="text" id="register-display-name"
                       name="displayName" autocomplete="name" required />
                <label class="mdl-textfield__label" for="register-display-name">Display Name</label>
                <span class="mdl-textfield__error">Display name is required</span>
              </div>

              <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
                <input class="mdl-textfield__input" type="email" id="register-email"
                       name="email" autocomplete="email" required />
                <label class="mdl-textfield__label" for="register-email">Email</label>
                <span class="mdl-textfield__error">Please enter a valid email address</span>
              </div>

              <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
                <input class="mdl-textfield__input" type="password" id="register-password"
                       name="password" autocomplete="new-password" required />
                <label class="mdl-textfield__label" for="register-password">Password</label>
                <span class="mdl-textfield__error">Password is required</span>
              </div>

              <div class="password-requirements" id="password-requirements">
                <p class="password-requirements__title">Password must contain:</p>
                <ul class="password-requirements__list">
                  <li id="req-length" class="password-req">At least 8 characters</li>
                  <li id="req-uppercase" class="password-req">At least one uppercase letter</li>
                  <li id="req-lowercase" class="password-req">At least one lowercase letter</li>
                  <li id="req-digit" class="password-req">At least one digit</li>
                </ul>
              </div>

              <div class="form-actions">
                <button type="submit" id="register-submit"
                        class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect">
                  Create Account
                </button>
              </div>
            </form>

            <div class="auth-divider">
              <span>or</span>
            </div>

            <div class="auth-sso-buttons">
              <button id="google-sso-btn"
                      class="mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect auth-sso-btn auth-sso-btn--google">
                <img src="https://developers.google.com/identity/images/g-logo.png"
                     alt="" width="18" height="18" class="sso-icon" />
                Sign up with Google
              </button>
              <button id="apple-sso-btn"
                      class="mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect auth-sso-btn auth-sso-btn--apple">
                <i class="material-icons sso-icon">apple</i>
                Sign up with Apple
              </button>
            </div>

            <div class="auth-footer">
              <p>Already have an account?
                <a href="/login" data-nav="/login" class="auth-link">Log In</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const form = this.container.querySelector('#register-form') as HTMLFormElement;
    form?.addEventListener('submit', (e) => this.handleSubmit(e));

    // Live password validation feedback
    const passwordInput = this.container.querySelector('#register-password') as HTMLInputElement;
    passwordInput?.addEventListener('input', () => this.updatePasswordRequirements(passwordInput.value));

    const googleBtn = this.container.querySelector('#google-sso-btn');
    googleBtn?.addEventListener('click', () => this.handleGoogleSSO());

    const appleBtn = this.container.querySelector('#apple-sso-btn');
    appleBtn?.addEventListener('click', () => this.handleAppleSSO());
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const displayNameInput = this.container.querySelector('#register-display-name') as HTMLInputElement;
    const emailInput = this.container.querySelector('#register-email') as HTMLInputElement;
    const passwordInput = this.container.querySelector('#register-password') as HTMLInputElement;
    const submitBtn = this.container.querySelector('#register-submit') as HTMLButtonElement;

    const displayName = displayNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Client-side validation
    if (!displayName) {
      this.showError('Please enter your display name.');
      return;
    }

    if (!email) {
      this.showError('Please enter your email address.');
      return;
    }

    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      this.showError(passwordValidation.errors.join(' '));
      return;
    }

    this.clearError();
    submitBtn.disabled = true;

    try {
      await apiClient.post('/auth/register', { email, password, displayName });
      // On success, redirect to login page
      this.navigateTo('/login');
    } catch (err) {
      const apiErr = err as ApiError;
      this.showError(apiErr.message || 'Registration failed. Please try again.');
    } finally {
      submitBtn.disabled = false;
    }
  }

  private async handleGoogleSSO(): Promise<void> {
    try {
      const google = (window as unknown as { google?: { accounts?: unknown } }).google;
      if (!google?.accounts) {
        this.showError('Google Sign-In is not available. Please try again later.');
        return;
      }
      this.showError('Google Sign-In integration pending configuration.');
    } catch (err) {
      const apiErr = err as ApiError;
      this.showError(apiErr.message || 'Google sign-up failed. Please try again.');
    }
  }

  private async handleAppleSSO(): Promise<void> {
    try {
      const appleAuth = (window as unknown as { AppleID?: { auth?: unknown } }).AppleID;
      if (!appleAuth?.auth) {
        this.showError('Apple Sign-In is not available. Please try again later.');
        return;
      }
      this.showError('Apple Sign-In integration pending configuration.');
    } catch (err) {
      const apiErr = err as ApiError;
      this.showError(apiErr.message || 'Apple sign-up failed. Please try again.');
    }
  }

  /**
   * Validates password against requirements:
   * - At least 8 characters
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one digit
   */
  validatePassword(password: string): ValidationResult {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters.');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter.');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter.');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one digit.');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Updates the visual password requirements checklist as the user types.
   */
  private updatePasswordRequirements(password: string): void {
    const setReqStatus = (id: string, met: boolean) => {
      const el = this.container.querySelector(`#${id}`);
      if (el) {
        el.classList.toggle('is-met', met);
        el.classList.toggle('is-unmet', !met);
      }
    };

    setReqStatus('req-length', password.length >= 8);
    setReqStatus('req-uppercase', /[A-Z]/.test(password));
    setReqStatus('req-lowercase', /[a-z]/.test(password));
    setReqStatus('req-digit', /[0-9]/.test(password));
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector('#register-error') as HTMLElement;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    }
  }

  private clearError(): void {
    const errorEl = this.container.querySelector('#register-error') as HTMLElement;
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
    }
  }

  private navigateTo(path: string): void {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path } }));
  }

  private upgradeComponents(): void {
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
    }
  }
}
