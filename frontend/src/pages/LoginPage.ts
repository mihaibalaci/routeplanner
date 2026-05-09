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
          <div style="display:flex;align-items:center;justify-content:center;gap:var(--space-3);margin-bottom:var(--space-6);">
            <div class="sidebar__brand-icon" style="width:36px;height:36px;border-radius:var(--radius-lg);background:var(--color-primary-600);display:flex;align-items:center;justify-content:center;">
              <span class="material-symbols-rounded" style="font-size:20px;color:white;">route</span>
            </div>
            <h2 class="card__title" style="text-align:center;font-size:var(--font-size-2xl);margin:0;">Log In</h2>
          </div>

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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Apple
          </button>
          <button class="sso-btn" id="btn-email">
            <span class="material-symbols-rounded" style="font-size:18px;">mail</span>
            Email
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
    this.container.querySelector('#btn-email')?.addEventListener('click', () => {
      window.history.pushState({}, '', '/register');
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/register' } }));
    });
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
