/**
 * Register Page — Modern design
 */
import { apiClient, ApiError } from '../api/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class RegisterPage {
  private container: HTMLElement;
  private errors: string[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }

  private build(): string {
    const errorsHtml = this.errors.length > 0
      ? `<div class="alert alert--error" id="register-errors"><ul style="margin:0;padding-left:var(--space-4);">${this.errors.map(e => `<li>${this.escapeHtml(e)}</li>`).join('')}</ul></div>`
      : '<div class="alert alert--error" id="register-errors" style="display:none;"></div>';

    return `
      <div class="auth-page">
        <div class="card card--elevated auth-card">
          <h2 class="card__title" style="text-align:center;font-size:var(--font-size-2xl);margin-bottom:var(--space-6);">Create Account</h2>

          ${errorsHtml}

          <form id="register-form" style="display:flex;flex-direction:column;gap:var(--space-4);">
            <div class="input-group">
              <label class="input-group__label" for="reg-name">Display Name</label>
              <input class="input input--lg" type="text" id="reg-name" autocomplete="name" required placeholder="Your name" maxlength="100" />
            </div>
            <div class="input-group">
              <label class="input-group__label" for="reg-email">Email</label>
              <input class="input input--lg" type="email" id="reg-email" autocomplete="email" required placeholder="you@example.com" maxlength="254" />
            </div>
            <div class="input-group">
              <label class="input-group__label" for="reg-password">Password</label>
              <input class="input input--lg" type="password" id="reg-password" autocomplete="new-password" required placeholder="Min 8 chars, uppercase, lowercase, digit" />
            </div>
            <button type="submit" id="register-submit" class="btn btn--primary btn--lg" style="width:100%;margin-top:var(--space-2);">
              Create Account
            </button>
          </form>

          <p style="text-align:center;margin-top:var(--space-6);font-size:var(--font-size-sm);color:var(--color-text-secondary);">
            Already have an account? <a href="/login" data-nav="/login">Log In</a>
          </p>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#register-form')?.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  private validateForm(displayName: string, email: string, password: string): string[] {
    const errors: string[] = [];

    if (!displayName || !email || !password) {
      errors.push('All fields are required.');
      return errors;
    }

    // Email format validation
    if (!EMAIL_REGEX.test(email)) {
      errors.push('Email format is invalid.');
    }

    // Password validation — collect all errors at once
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters.');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain an uppercase letter.');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain a lowercase letter.');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain a digit.');
    }

    return errors;
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const displayName = (this.container.querySelector('#reg-name') as HTMLInputElement).value.trim();
    const email = (this.container.querySelector('#reg-email') as HTMLInputElement).value.trim();
    const password = (this.container.querySelector('#reg-password') as HTMLInputElement).value;

    // Client-side validation — show all errors at once
    const validationErrors = this.validateForm(displayName, email, password);
    if (validationErrors.length > 0) {
      this.showErrors(validationErrors);
      return;
    }

    // Set loading state without full re-render to preserve input values
    this.setLoadingState(true);
    this.hideErrors();

    try {
      await apiClient.post('/auth/register', { email, password, displayName });
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/login' } }));
    } catch (err) {
      const errorMessages = this.extractErrorMessages(err);
      this.showErrors(errorMessages);
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Extract user-friendly error messages from an API error based on status code.
   */
  private extractErrorMessages(err: unknown): string[] {
    // Network error (fetch throws TypeError when network is unavailable)
    if (err instanceof TypeError) {
      return ['Unable to connect. Please check your internet connection.'];
    }

    const apiError = err as ApiError;

    // No status means it's likely a network error
    if (!apiError.status) {
      return ['Unable to connect. Please check your internet connection.'];
    }

    switch (apiError.status) {
      case 409:
        return ['This email is already registered. <a href="/login" data-nav="/login">Try logging in instead.</a>'];
      case 400:
        // Display the errors array from the server if available
        if (apiError.errors && apiError.errors.length > 0) {
          return apiError.errors;
        }
        return [apiError.message || 'Registration failed.'];
      case 429:
        return [apiError.message || 'Too many requests. Please try again later.'];
      default:
        if (apiError.status >= 500) {
          return ['Something went wrong. Please try again later.'];
        }
        return [apiError.message || 'Registration failed.'];
    }
  }

  /**
   * Toggle loading state on the submit button without re-rendering the entire form.
   * This preserves input values.
   */
  private setLoadingState(loading: boolean): void {
    const button = this.container.querySelector('#register-submit') as HTMLButtonElement;
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span>';
    } else {
      button.disabled = false;
      button.innerHTML = 'Create Account';
    }
  }

  /**
   * Show error messages in the error container without full re-render.
   */
  private showErrors(errors: string[]): void {
    this.errors = errors;
    const errorContainer = this.container.querySelector('#register-errors') as HTMLElement;
    if (errorContainer) {
      errorContainer.innerHTML = `<ul style="margin:0;padding-left:var(--space-4);">${errors.map(e => `<li>${e}</li>`).join('')}</ul>`;
      errorContainer.style.display = '';
    } else {
      // Fallback: full re-render if error container not found
      this.rerender();
    }
  }

  /**
   * Hide the error container without full re-render.
   */
  private hideErrors(): void {
    this.errors = [];
    const errorContainer = this.container.querySelector('#register-errors') as HTMLElement;
    if (errorContainer) {
      errorContainer.style.display = 'none';
      errorContainer.innerHTML = '';
    }
  }

  private rerender(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }

  private escapeHtml(text: string): string {
    // Don't escape if it contains intentional HTML (like login links)
    if (text.includes('<a ')) return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
