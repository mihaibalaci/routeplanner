/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterPage } from './RegisterPage';

// Mock the apiClient module
vi.mock('../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

describe('RegisterPage', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  describe('input attributes', () => {
    it('renders email input with maxlength="254"', () => {
      const page = new RegisterPage(container);
      page.render();

      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      expect(emailInput).not.toBeNull();
      expect(emailInput.getAttribute('maxlength')).toBe('254');
    });

    it('renders display name input with maxlength="100"', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      expect(nameInput).not.toBeNull();
      expect(nameInput.getAttribute('maxlength')).toBe('100');
    });
  });

  describe('client-side email format validation', () => {
    it('shows error for invalid email format before submission', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      const form = container.querySelector('#register-form') as HTMLFormElement;

      nameInput.value = 'Test User';
      emailInput.value = 'invalid-email';
      passwordInput.value = 'ValidPass1';

      form.dispatchEvent(new Event('submit', { cancelable: true }));

      const errorText = container.textContent || '';
      expect(errorText).toContain('Email format is invalid.');
    });

    it('accepts valid email format', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      const form = container.querySelector('#register-form') as HTMLFormElement;

      nameInput.value = 'Test User';
      emailInput.value = 'user@example.com';
      passwordInput.value = 'ValidPass1';

      form.dispatchEvent(new Event('submit', { cancelable: true }));

      const errorText = container.textContent || '';
      expect(errorText).not.toContain('Email format is invalid.');
    });
  });

  describe('password validation shows all errors at once', () => {
    it('shows all password errors simultaneously for a completely invalid password', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      const form = container.querySelector('#register-form') as HTMLFormElement;

      nameInput.value = 'Test User';
      emailInput.value = 'user@example.com';
      passwordInput.value = '---'; // too short, no uppercase, no lowercase letter (has -), no digit

      form.dispatchEvent(new Event('submit', { cancelable: true }));

      const errorText = container.textContent || '';
      expect(errorText).toContain('Password must be at least 8 characters.');
      expect(errorText).toContain('Password must contain an uppercase letter.');
      expect(errorText).toContain('Password must contain a lowercase letter.');
      expect(errorText).toContain('Password must contain a digit.');
    });

    it('shows multiple password errors when several rules are violated', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      const form = container.querySelector('#register-form') as HTMLFormElement;

      nameInput.value = 'Test User';
      emailInput.value = 'user@example.com';
      passwordInput.value = 'abcdefgh'; // long enough, has lowercase, but no uppercase and no digit

      form.dispatchEvent(new Event('submit', { cancelable: true }));

      const errorText = container.textContent || '';
      expect(errorText).toContain('Password must contain an uppercase letter.');
      expect(errorText).toContain('Password must contain a digit.');
      expect(errorText).not.toContain('Password must be at least 8 characters.');
      expect(errorText).not.toContain('Password must contain a lowercase letter.');
    });
  });

  describe('required fields validation', () => {
    it('shows error when all fields are empty', () => {
      const page = new RegisterPage(container);
      page.render();

      const form = container.querySelector('#register-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));

      const errorText = container.textContent || '';
      expect(errorText).toContain('All fields are required.');
    });
  });

  describe('form structure and field attributes', () => {
    it('renders a form with id register-form', () => {
      const page = new RegisterPage(container);
      page.render();

      const form = container.querySelector('#register-form');
      expect(form).not.toBeNull();
      expect(form!.tagName).toBe('FORM');
    });

    it('renders password input with type="password" and correct id', () => {
      const page = new RegisterPage(container);
      page.render();

      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      expect(passwordInput).not.toBeNull();
      expect(passwordInput.type).toBe('password');
      expect(passwordInput.autocomplete).toBe('new-password');
    });

    it('renders email input with type="email"', () => {
      const page = new RegisterPage(container);
      page.render();

      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      expect(emailInput).not.toBeNull();
      expect(emailInput.type).toBe('email');
    });

    it('renders display name input with type="text"', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      expect(nameInput).not.toBeNull();
      expect(nameInput.type).toBe('text');
    });

    it('renders submit button with id register-submit', () => {
      const page = new RegisterPage(container);
      page.render();

      const button = container.querySelector('#register-submit') as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(button.type).toBe('submit');
      expect(button.textContent).toContain('Create Account');
    });

    it('all inputs have required attribute', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;

      expect(nameInput.required).toBe(true);
      expect(emailInput.required).toBe(true);
      expect(passwordInput.required).toBe(true);
    });
  });

  describe('combined client-side validation', () => {
    it('shows both email and password errors when both are invalid', () => {
      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      const form = container.querySelector('#register-form') as HTMLFormElement;

      nameInput.value = 'Test User';
      emailInput.value = 'not-an-email';
      passwordInput.value = 'short';

      form.dispatchEvent(new Event('submit', { cancelable: true }));

      const errorText = container.textContent || '';
      expect(errorText).toContain('Email format is invalid.');
      expect(errorText).toContain('Password must be at least 8 characters.');
      expect(errorText).toContain('Password must contain an uppercase letter.');
      expect(errorText).toContain('Password must contain a digit.');
    });
  });

  describe('loading state', () => {
    it('disables submit button and shows spinner during submission', async () => {
      const { apiClient } = await import('../api/client');
      // Make the API call hang so we can inspect loading state
      let resolvePost: (value: unknown) => void;
      (apiClient.post as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolvePost = resolve; })
      );

      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      const form = container.querySelector('#register-form') as HTMLFormElement;

      nameInput.value = 'Test User';
      emailInput.value = 'user@example.com';
      passwordInput.value = 'ValidPass1';

      form.dispatchEvent(new Event('submit', { cancelable: true }));

      // Wait a tick for the async handler to set loading state
      await new Promise((r) => setTimeout(r, 0));

      const button = container.querySelector('#register-submit') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.querySelector('.spinner')).not.toBeNull();

      // Resolve the pending request to clean up
      resolvePost!({ data: {}, status: 201 });
    });

    it('re-enables submit button after request completes', async () => {
      const { apiClient } = await import('../api/client');
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, status: 201 });

      const page = new RegisterPage(container);
      page.render();

      const nameInput = container.querySelector('#reg-name') as HTMLInputElement;
      const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
      const form = container.querySelector('#register-form') as HTMLFormElement;

      nameInput.value = 'Test User';
      emailInput.value = 'user@example.com';
      passwordInput.value = 'ValidPass1';

      form.dispatchEvent(new Event('submit', { cancelable: true }));

      // Wait for the async handler to complete
      await new Promise((r) => setTimeout(r, 0));

      const button = container.querySelector('#register-submit') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain('Create Account');
    });
  });

  describe('navigation link', () => {
    it('renders a "Log In" link with data-nav="/login"', () => {
      const page = new RegisterPage(container);
      page.render();

      const loginLink = container.querySelector('a[data-nav="/login"]') as HTMLAnchorElement;
      expect(loginLink).not.toBeNull();
      expect(loginLink.textContent).toContain('Log In');
      expect(loginLink.getAttribute('href')).toBe('/login');
    });
  });
});
