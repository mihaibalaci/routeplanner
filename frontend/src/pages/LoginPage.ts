/**
 * Login Page Component
 *
 * Provides email/password login form with:
 * - MDL text fields for email and password
 * - Inline validation error display
 * - Google SSO button
 * - Apple SSO button
 * - Link to registration page
 *
 * Validates: Requirements 10.1, 10.4, 10.5, 10.11
 */

import { apiClient, ApiError } from '../api/client';

interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: { id: string; email: string; displayName: string };
}

export class LoginPage {
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
            <h2 class="mdl-card__title-text">Log In</h2>
          </div>
          <div class="mdl-card__supporting-text auth-card__body">
            <form id="login-form" novalidate>
              <div class="auth-error" id="login-error" role="alert" aria-live="polite"></div>

              <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
                <input class="mdl-textfield__input" type="email" id="login-email"
                       name="email" autocomplete="email" required />
                <label class="mdl-textfield__label" for="login-email">Email</label>
                <span class="mdl-textfield__error">Please enter a valid email address</span>
              </div>

              <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
                <input class="mdl-textfield__input" type="password" id="login-password"
                       name="password" autocomplete="current-password" required />
                <label class="mdl-textfield__label" for="login-password">Password</label>
                <span class="mdl-textfield__error">Password is required</span>
              </div>

              <div class="form-actions">
                <button type="submit" id="login-submit"
                        class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect">
                  Log In
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
                Sign in with Google
              </button>
              <button id="apple-sso-btn"
                      class="mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect auth-sso-btn auth-sso-btn--apple">
                <i class="material-icons sso-icon">apple</i>
                Sign in with Apple
              </button>
            </div>

            <div class="auth-footer">
              <p>Don't have an account?
                <a href="/register" data-nav="/register" class="auth-link">Register</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const form = this.container.querySelector('#login-form') as HTMLFormElement;
    form?.addEventListener('submit', (e) => this.handleSubmit(e));

    const googleBtn = this.container.querySelector('#google-sso-btn');
    googleBtn?.addEventListener('click', () => this.handleGoogleSSO());

    const appleBtn = this.container.querySelector('#apple-sso-btn');
    appleBtn?.addEventListener('click', () => this.handleAppleSSO());
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const emailInput = this.container.querySelector('#login-email') as HTMLInputElement;
    const passwordInput = this.container.querySelector('#login-password') as HTMLInputElement;
    const submitBtn = this.container.querySelector('#login-submit') as HTMLButtonElement;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Basic client-side validation
    if (!email || !password) {
      this.showError('Please enter both email and password.');
      return;
    }

    this.clearError();
    submitBtn.disabled = true;

    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', { email, password });
      apiClient.setToken(response.data.token);
      if (response.data.refreshToken) {
        apiClient.setRefreshToken(response.data.refreshToken);
      }
      this.navigateTo('/');
    } catch (err) {
      const apiErr = err as ApiError;
      this.showError(apiErr.message || 'Login failed. Please check your credentials.');
    } finally {
      submitBtn.disabled = false;
    }
  }

  private async handleGoogleSSO(): Promise<void> {
    // In a real implementation, this would use the Google Identity Services SDK
    // to get an idToken, then send it to the backend.
    // For now, we trigger the Google sign-in flow placeholder.
    try {
      const idToken = await this.getGoogleIdToken();
      if (!idToken) return;

      const response = await apiClient.post<AuthResponse>('/auth/google', { idToken });
      apiClient.setToken(response.data.token);
      if (response.data.refreshToken) {
        apiClient.setRefreshToken(response.data.refreshToken);
      }
      this.navigateTo('/');
    } catch (err) {
      const apiErr = err as ApiError;
      this.showError(apiErr.message || 'Google sign-in failed. Please try again.');
    }
  }

  private async handleAppleSSO(): Promise<void> {
    // In a real implementation, this would use the Apple Sign In JS SDK
    // to get an authorization code, then send it to the backend.
    try {
      const authCode = await this.getAppleAuthCode();
      if (!authCode) return;

      const response = await apiClient.post<AuthResponse>('/auth/apple', { authCode });
      apiClient.setToken(response.data.token);
      if (response.data.refreshToken) {
        apiClient.setRefreshToken(response.data.refreshToken);
      }
      this.navigateTo('/');
    } catch (err) {
      const apiErr = err as ApiError;
      this.showError(apiErr.message || 'Apple sign-in failed. Please try again.');
    }
  }

  /**
   * Placeholder for Google Identity Services integration.
   * In production, this would initialize the Google Sign-In SDK and return the idToken.
   */
  private async getGoogleIdToken(): Promise<string | null> {
    // Check if Google Identity Services is loaded
    const google = (window as unknown as { google?: { accounts?: unknown } }).google;
    if (!google?.accounts) {
      this.showError('Google Sign-In is not available. Please try again later.');
      return null;
    }
    // The actual implementation would use google.accounts.id.initialize()
    // and return the credential from the callback
    this.showError('Google Sign-In integration pending configuration.');
    return null;
  }

  /**
   * Placeholder for Apple Sign In JS integration.
   * In production, this would initialize Apple Sign In and return the authorization code.
   */
  private async getAppleAuthCode(): Promise<string | null> {
    const appleAuth = (window as unknown as { AppleID?: { auth?: unknown } }).AppleID;
    if (!appleAuth?.auth) {
      this.showError('Apple Sign-In is not available. Please try again later.');
      return null;
    }
    // The actual implementation would use AppleID.auth.signIn()
    // and return the authorization code from the response
    this.showError('Apple Sign-In integration pending configuration.');
    return null;
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector('#login-error') as HTMLElement;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    }
  }

  private clearError(): void {
    const errorEl = this.container.querySelector('#login-error') as HTMLElement;
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
