/**
 * API Client Service
 *
 * Handles all HTTP communication with the backend API.
 * Features:
 * - Base URL configuration (env or default)
 * - JWT token storage in localStorage
 * - Automatic Authorization header injection
 * - Token refresh on 401 responses
 * - Typed request methods (get, post, put, delete)
 */

const TOKEN_KEY = 'routeplanner_token';
const REFRESH_TOKEN_KEY = 'routeplanner_refresh_token';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

class ApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.baseUrl =
      (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env
        ?.VITE_API_BASE_URL || '/api/v1';
  }

  // --- Token Management ---

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setRefreshToken(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  }

  clearTokens(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    // Check if token is expired by decoding payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = payload.exp * 1000; // Convert to ms
      return Date.now() < expiresAt;
    } catch {
      return false;
    }
  }

  // --- HTTP Methods ---

  async get<T>(
    path: string,
    params?: Record<string, string>,
    options?: { signal?: AbortSignal }
  ): Promise<ApiResponse<T>> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    return this.request<T>(url, { method: 'GET', signal: options?.signal });
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(`${this.baseUrl}${path}`, { method: 'DELETE' });
  }

  // --- Core Request Logic ---

  private async request<T>(
    url: string,
    options: RequestInit,
    isRetry = false
  ): Promise<ApiResponse<T>> {
    const headers = new Headers(options.headers || {});

    // Inject Authorization header if token exists
    const token = this.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, { ...options, headers });

    // Handle 401 — token expired or invalid
    if (response.status === 401 && !isRetry) {
      // Try refresh if we have a refresh token
      if (this.getRefreshToken()) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.request<T>(url, options, true);
        }
      }
      // Clear stale tokens and redirect to login
      this.clearTokens();
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/login' } }));
      throw this.createApiError(401, 'Session expired. Please log in again.');
    }

    if (!response.ok) {
      let errorBody: { message?: string; details?: unknown } = {};
      try {
        errorBody = await response.json();
      } catch {
        // Response body not JSON
      }
      throw this.createApiError(
        response.status,
        errorBody.message || response.statusText,
        errorBody.details
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return { data: undefined as unknown as T, status: 204 };
    }

    const data: T = await response.json();
    return { data, status: response.status };
  }

  // --- Token Refresh ---

  private async refreshToken(): Promise<boolean> {
    // Deduplicate concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (data.token) {
        this.setToken(data.token);
      }
      if (data.refreshToken) {
        this.setRefreshToken(data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  }

  // --- Helpers ---

  private createApiError(status: number, message: string, details?: unknown): ApiError {
    return { status, message, details };
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
