/**
 * Login Page — Modern design
 */
import { apiClient, ApiError } from '../api/client';

export class LoginPage {
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
          <h2 class="card__title" style="text-align:center;font-size:var(--font-size-2xl);margin-bottom:var(--space-6);">Log In</h2>

          ${this.error ? `<div class="alert alert--error">${this.error}</div>` : ''}

          <form id="login-form" style="display:flex;flex-direction:column;gap:var(--space-4);">
            <div class="input-group">
              <label class="input-group__label" for="login-email">Email</label>
              <input class="input input--lg" type="email" id="login-email" autocomplete="email" required placeholder="you@example.com" />
            </div>
            <div class="input-group">
              <label class="input-group__label" for="login-password">Password</label>
              <input class="input input--lg" type="password" id="login-password" autocomplete="current-password" required placeholder="••••••••" />
            </div>
            <button type="submit" class="btn btn--primary btn--lg" style="width:100%;margin-top:var(--space-2);" ${this.loading ? 'disabled' : ''}>
              ${this.loading ? '<span class="spinner" style="width:16px;height:16px;"></span>' : 'Log In'}
            </button>
          </form>

          <div class="auth-divider">or continue with</div>

          <button class="sso-btn" id="btn-google">
            <img src="https://developers.google.com/identity/images/g-logo.png" alt="" width="18" height="18" />
            Google
          </button>
          <button class="sso-btn" id="btn-apple">
            <span class="material-symbols-rounded" style="font-size:18px;">apple</span>
            Apple
          </button>

          <p style="text-align:center;margin-top:var(--space-6);font-size:var(--font-size-sm);color:var(--color-text-secondary);">
            Don't have an account? <a href="/register" data-nav="/register">Register</a>
          </p>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#login-form')?.addEventListener('submit', (e) => this.handleSubmit(e));
    this.container.querySelector('#btn-google')?.addEventListener('click', () => this.showError('Google Sign-In requires API key configuration.'));
    this.container.querySelector('#btn-apple')?.addEventListener('click', () => this.showError('Apple Sign-In requires API key configuration.'));
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const email = (this.container.querySelector('#login-email') as HTMLInputElement).value.trim();
    const password = (this.container.querySelector('#login-password') as HTMLInputElement).value;
    if (!email || !password) { this.showError('Please enter both email and password.'); return; }

    this.loading = true;
    this.error = null;
    // Update button state without full rerender (which would lose input values)
    const btn = this.container.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span>'; }

    try {
      const res = await apiClient.post<any>('/auth/login', { email, password });
      const token = res.data?.data?.token || res.data?.token;
      if (token) {
        apiClient.setToken(token);
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/' } }));
      } else {
        this.showError('Unexpected response from server.');
      }
    } catch (err) {
      this.showError((err as ApiError).message || 'Login failed.');
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
