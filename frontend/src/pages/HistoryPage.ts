/**
 * History Page — Lists saved routes ordered by date descending.
 */
import { apiClient } from '../api/client';

interface SavedRoute {
  id: string;
  name: string;
  origin: string;
  destination: string;
  waypoints_count: number;
  total_distance_km: number | null;
  status: string;
  created_at: string;
}

export class HistoryPage {
  private container: HTMLElement;
  private routes: SavedRoute[] = [];
  private loading = true;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
    this.loadRoutes();
  }

  private build(): string {
    return `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Route History</h1>
          <p class="page-header__subtitle">Your saved routes, sorted by most recent.</p>
        </div>
        <div id="history-content">
          ${this.loading ? this.buildLoading() : this.routes.length > 0 ? this.buildList() : this.buildEmpty()}
        </div>
      </div>
    `;
  }

  private buildLoading(): string {
    return `
      <div class="card" style="text-align:center;padding:var(--space-8);">
        <div class="cost-breakdown-panel__spinner"></div>
        <p style="margin-top:var(--space-3);color:var(--color-text-secondary);">Loading routes...</p>
      </div>
    `;
  }

  private buildEmpty(): string {
    return `
      <div class="card">
        <div class="empty-state">
          <span class="material-symbols-rounded empty-state__icon">history</span>
          <p class="empty-state__title">No saved routes yet</p>
          <p class="empty-state__text">Plan and calculate a route to see it here.</p>
          <a href="/" data-nav="/" class="btn btn--primary" style="margin-top:var(--space-4);">
            <span class="material-symbols-rounded">map</span> Route Planner
          </a>
        </div>
      </div>
    `;
  }

  private buildList(): string {
    const rows = this.routes.map(route => {
      const date = new Date(route.created_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const distance = route.total_distance_km ? `${route.total_distance_km.toFixed(0)} km` : '—';
      const statusBadge = route.status === 'calculated'
        ? '<span class="badge badge--success">Calculated</span>'
        : '<span class="badge badge--neutral">Draft</span>';

      return `
        <div class="history-item" data-route-id="${route.id}" role="button" tabindex="0">
          <div class="history-item__icon">
            <span class="material-symbols-rounded">route</span>
          </div>
          <div class="history-item__details">
            <div class="history-item__title">${route.origin} → ${route.destination}</div>
            <div class="history-item__meta">
              <span>${distance}</span>
              ${route.waypoints_count > 2 ? `<span>•</span><span>${route.waypoints_count - 2} stops</span>` : ''}
              <span>•</span>
              ${statusBadge}
            </div>
            <div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--color-text-muted);font-family:monospace;">
              ID: <span class="route-id-text" title="Click to copy">${route.id}</span>
            </div>
          </div>
          <div class="history-item__right">
            <div class="history-item__date">${date}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="history-list">
          ${rows}
        </div>
      </div>
      <p style="margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--color-text-secondary);">
        ${this.routes.length} route${this.routes.length !== 1 ? 's' : ''} saved
      </p>
    `;
  }

  private bindEvents(): void {
    this.container.addEventListener('click', (e) => {
      // Copy route ID on click
      const idEl = (e.target as HTMLElement).closest('.route-id-text') as HTMLElement;
      if (idEl) {
        e.stopPropagation();
        navigator.clipboard.writeText(idEl.textContent || '').then(() => {
          idEl.style.color = 'var(--color-primary)';
          idEl.textContent = 'Copied!';
          setTimeout(() => {
            idEl.style.color = '';
            idEl.textContent = idEl.closest('.history-item')?.getAttribute('data-route-id') || '';
          }, 1500);
        });
        return;
      }

      const item = (e.target as HTMLElement).closest('.history-item') as HTMLElement;
      if (item) {
        const routeId = item.dataset.routeId;
        if (routeId) {
          window.history.pushState({}, '', `/?route=${routeId}`);
          window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/' } }));
        }
      }
    });
  }

  private async loadRoutes(): Promise<void> {
    if (!apiClient.isAuthenticated()) {
      this.loading = false;
      this.updateContent();
      return;
    }

    try {
      const response = await apiClient.get<any>('/routes');
      const data = response.data?.data ?? response.data ?? [];
      this.routes = Array.isArray(data) ? data : [];
    } catch {
      this.routes = [];
    }

    this.loading = false;
    this.updateContent();
  }

  private updateContent(): void {
    const content = this.container.querySelector('#history-content');
    if (content) {
      content.innerHTML = this.routes.length > 0 ? this.buildList() : this.buildEmpty();
    }
  }
}
