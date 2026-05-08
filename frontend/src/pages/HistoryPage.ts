/**
 * History Page
 *
 * Displays saved routes list:
 * - Display saved routes list sorted by date (from GET /users/me/routes)
 * - Each route shows name, distance, duration, date
 * - "Load" button to navigate to route planner with that route
 * - "Delete" button with confirmation
 *
 * Requirements: 11.3, 11.4, 11.5
 */

import { apiClient, ApiError } from '../api/client';

interface SavedRoute {
  id: string;
  name: string;
  total_distance_km: number;
  total_duration_seconds: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export class HistoryPage {
  private container: HTMLElement;
  private routes: SavedRoute[] = [];
  private loading = false;
  private error: string | null = null;
  private deleteConfirmId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async render(): Promise<void> {
    this.container.innerHTML = this.buildLoading();
    this.upgradeComponents();
    await this.loadRoutes();
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private async loadRoutes(): Promise<void> {
    this.loading = true;
    try {
      const res = await apiClient.get<SavedRoute[]>('/users/me/routes');
      this.routes = res.data;
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to load route history.';
    } finally {
      this.loading = false;
    }
  }

  private buildTemplate(): string {
    if (this.error) {
      return `
        <div class="history-page">
          ${this.buildError()}
        </div>
      `;
    }

    if (this.loading) {
      return this.buildLoading();
    }

    return `
      <div class="history-page">
        <div class="mdl-card mdl-shadow--2dp app-card">
          <div class="mdl-card__title">
            <h2 class="mdl-card__title-text">
              <i class="material-icons">history</i>&nbsp;Route History
            </h2>
          </div>
          <div class="mdl-card__supporting-text">
            ${this.routes.length === 0
              ? '<p style="text-align:center;padding:16px;">No saved routes yet. Plan a route to see it here.</p>'
              : this.buildRouteList()}
          </div>
        </div>
        ${this.deleteConfirmId ? this.buildDeleteConfirmDialog() : ''}
      </div>
    `;
  }

  private buildRouteList(): string {
    return `
      <table class="mdl-data-table mdl-js-data-table" style="width:100%;">
        <thead>
          <tr>
            <th class="mdl-data-table__cell--non-numeric">Name</th>
            <th>Distance</th>
            <th>Duration</th>
            <th>Date</th>
            <th class="mdl-data-table__cell--non-numeric">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.routes.map((route) => this.buildRouteRow(route)).join('')}
        </tbody>
      </table>
    `;
  }

  private buildRouteRow(route: SavedRoute): string {
    const name = route.name || 'Unnamed Route';
    const distance = route.total_distance_km
      ? `${route.total_distance_km.toFixed(1)} km`
      : '—';
    const duration = route.total_duration_seconds
      ? this.formatDuration(route.total_duration_seconds)
      : '—';
    const date = new Date(route.created_at).toLocaleDateString();

    return `
      <tr>
        <td class="mdl-data-table__cell--non-numeric">${name}</td>
        <td>${distance}</td>
        <td>${duration}</td>
        <td>${date}</td>
        <td class="mdl-data-table__cell--non-numeric">
          <button class="mdl-button mdl-js-button mdl-button--icon mdl-button--colored btn-load-route"
                  data-route-id="${route.id}" title="Load route">
            <i class="material-icons">open_in_new</i>
          </button>
          <button class="mdl-button mdl-js-button mdl-button--icon btn-delete-route"
                  data-route-id="${route.id}" title="Delete route"
                  style="color:#d32f2f;">
            <i class="material-icons">delete</i>
          </button>
        </td>
      </tr>
    `;
  }

  private buildDeleteConfirmDialog(): string {
    return `
      <div id="delete-confirm-overlay"
           style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
        <div class="mdl-card mdl-shadow--4dp" style="min-width:320px;">
          <div class="mdl-card__title">
            <h2 class="mdl-card__title-text">Delete Route?</h2>
          </div>
          <div class="mdl-card__supporting-text">
            Are you sure you want to delete this route? This action cannot be undone.
          </div>
          <div class="mdl-card__actions mdl-card--border" style="display:flex;justify-content:flex-end;gap:8px;">
            <button id="btn-cancel-delete"
                    class="mdl-button mdl-js-button mdl-js-ripple-effect">
              Cancel
            </button>
            <button id="btn-confirm-delete"
                    class="mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect"
                    style="background:#d32f2f;color:white;">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private buildError(): string {
    return `
      <div class="mdl-card mdl-shadow--2dp app-card" style="background:#f8d7da;">
        <div class="mdl-card__supporting-text" style="color:#721c24;">
          <i class="material-icons" style="vertical-align:middle;">error</i>
          ${this.error}
        </div>
      </div>
    `;
  }

  private buildLoading(): string {
    return `
      <div style="text-align:center;padding:32px;">
        <div class="mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active"></div>
        <p>Loading route history...</p>
      </div>
    `;
  }

  private bindEvents(): void {
    // Load route buttons
    this.container.querySelectorAll('.btn-load-route').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const routeId = (e.currentTarget as HTMLElement).dataset.routeId!;
        this.loadRoute(routeId);
      });
    });

    // Delete route buttons
    this.container.querySelectorAll('.btn-delete-route').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const routeId = (e.currentTarget as HTMLElement).dataset.routeId!;
        this.deleteConfirmId = routeId;
        this.rerender();
      });
    });

    // Confirm delete
    const confirmBtn = this.container.querySelector('#btn-confirm-delete');
    confirmBtn?.addEventListener('click', () => {
      if (this.deleteConfirmId) {
        this.deleteRoute(this.deleteConfirmId);
      }
    });

    // Cancel delete
    const cancelBtn = this.container.querySelector('#btn-cancel-delete');
    cancelBtn?.addEventListener('click', () => {
      this.deleteConfirmId = null;
      this.rerender();
    });

    // Click overlay to cancel
    const overlay = this.container.querySelector('#delete-confirm-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.deleteConfirmId = null;
        this.rerender();
      }
    });
  }

  private loadRoute(routeId: string): void {
    // Store the route ID and navigate to the planner
    sessionStorage.setItem('currentRouteId', routeId);
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/' } }));
  }

  private async deleteRoute(routeId: string): Promise<void> {
    try {
      await apiClient.delete(`/routes/${routeId}`);
      this.routes = this.routes.filter((r) => r.id !== routeId);
      this.deleteConfirmId = null;
      this.rerender();
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to delete route.';
      this.deleteConfirmId = null;
      this.rerender();
    }
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes} min`;
  }

  private rerender(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private upgradeComponents(): void {
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
    }
  }
}
