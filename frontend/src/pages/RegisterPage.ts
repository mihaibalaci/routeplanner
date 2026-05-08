/**
 * Register Page — Modern design
 */
import { apiClient, ApiError } from '../api/client';

export class RegisterPage {
  private container: HTMLElement;
  private error: string | null = null;
  private loading = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }

  private build(): string {
    return `
      <div class="auth-page">
        <div class="card card--elevated auth-card">
          <h2 class="card__title" style="text-align:center;font-size:var(--font-size-2xl);margin-bottom:var(--space-6);">Create Account</h2>

          ${this.error ? `<div class="alert alert--error">${this.error}</div>` : ''}

          <form id="register-form" style="display:flex;flex-direction:column;gap:var(--space-4);">
            <div class="input-group">
              <label class="input-group__label" for="reg-name">Display Name</label>
              <input class="input input--lg" type="text" id="reg-name" autocomplete="name" required placeholder="Your name" />
            </div>
            <div class="input-group">
              <label class="input-group__label" for="reg-email">Email</label>
              <input class="input input--lg" type="email" id="reg-email" autocomplete="email" required placeholder="you@example.com" />
            </div>
            <div class="input-group">
              <label class="input-group__label" for="reg-password">Password</label>
              <input class="input input--lg" type="password" id="reg-password" autocomplete="new-password" required placeholder="Min 8 chars, uppercase, lowercase, digit" />
            </div>
            <button type="submit" class="btn btn--primary btn--lg" style="width:100%;margin-top:var(--space-2);" ${this.loading ? 'disabled' : ''}>
              ${this.loading ? '<span class="spinner" style="width:16px;height:16px;"></span>' : 'Create Account'}
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

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const displayName = (this.container.querySelector('#reg-name') as HTMLInputElement).value.trim();
    const email = (this.container.querySelector('#reg-email') as HTMLInputElement).value.trim();
    const password = (this.container.querySelector('#reg-password') as HTMLInputElement).value;

    if (!displayName || !email || !password) { this.showError('All fields are required.'); return; }

    // Client-side password validation
    if (password.length < 8) { this.showError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(password)) { this.showError('Password must contain an uppercase letter.'); return; }
    if (!/[a-z]/.test(password)) { this.showError('Password must contain a lowercase letter.'); return; }
    if (!/[0-9]/.test(password)) { this.showError('Password must contain a digit.'); return; }

    this.loading = true;
    this.error = null;
    this.rerender();

    try {
      await apiClient.post('/auth/register', { email, password, displayName });
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/login' } }));
    } catch (err) {
      this.showError((err as ApiError).message || 'Registration failed.');
    } finally {
      this.loading = false;
      this.rerender();
    }
  }

  private showError(msg: string): void {
    this.error = msg;
    this.rerender();
  }

  private rerender(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }
}
