/**
 * History Page — Lists saved routes ordered by date descending.
 * Each entry shows: summary, date, vehicle, distance, cost.
 * Clicking a saved route reloads it in the Route Planner.
 */
import { apiClient } from '../api/client';

interface SavedRoute {
  id: string;
  name: string;
  origin: string;
  destination: string;
  waypoints_count: number;
  vehicle_name: string;
  vehicle_type: string;
  total_distance_km: number;
  total_cost_eur: number | null;
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
          <p class="empty-state__text">Plan and save a route to see it here.</p>
          <a href="/start" data-nav="/start" class="btn btn--primary" style="margin-top:var(--space-4);">
            <span class="material-symbols-rounded">explore</span> Start Planning
          </a>
        </div>
      </div>
    `;
  }

  private buildList(): string {
    const rows = this.routes.map(route => {
      const date = new Date(route.created_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
      const distance = route.total_distance_km ? `${route.total_distance_km.toFixed(0)} km` : '—';
      const cost = route.total_cost_eur !== null ? `€${route.total_cost_eur.toFixed(2)}` : '—';
      const typeIcon = route.vehicle_type === 'ev' ? 'electric_car' :
        route.vehicle_type === 'motorcycle' ? 'two_wheeler' :
        route.vehicle_type === 'camper' ? 'rv_hookup' : 'directions_car';

      return `
        <div class="history-item" data-route-id="${route.id}" role="button" tabindex="0">
          <div class="history-item__icon">
            <span class="material-symbols-rounded">${typeIcon}</span>
          </div>
          <div class="history-item__details">
            <div class="history-item__title">${route.origin} → ${route.destination}</div>
            <div class="history-item__meta">
              <span>${route.vehicle_name}</span>
              <span>•</span>
              <span>${distance}</span>
              ${route.waypoints_count > 2 ? `<span>•</span><span>${route.waypoints_count - 2} stops</span>` : ''}
            </div>
          </div>
          <div class="history-item__right">
            <div class="history-item__cost">${cost}</div>
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
    `;
  }

  private bindEvents(): void {
    this.container.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.history-item') as HTMLElement;
      if (item) {
        const routeId = item.dataset.routeId;
        if (routeId) {
          window.history.pushState({}, '', `/?route=${routeId}`);
          window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/', query: { route: routeId } } }));
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
      const response = await apiClient.get<{ data: SavedRoute[] }>('/routes/history');
      this.routes = response.data?.data ?? [];
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
