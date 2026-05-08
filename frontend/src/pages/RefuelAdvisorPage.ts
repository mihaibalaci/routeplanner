/**
 * Refuel Advisor Page
 *
 * Displays smart refueling suggestions:
 * - Display suggested refuel stops (from POST /refuel/:routeId/suggest)
 * - Accept/reject buttons for each suggestion
 * - Show next-best alternative on rejection
 * - Indicate expanded search radius detours
 * - Show fuel price info per station
 *
 * Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { apiClient, ApiError } from '../api/client';

interface FuelStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  fuelPrice?: number;
  distanceFromRouteKm?: number;
}

interface RefuelSuggestion {
  station: FuelStation;
  alternatives: FuelStation[];
  distanceFromStart: number;
  reason: string;
  expandedSearch: boolean;
}

export class RefuelAdvisorPage {
  private container: HTMLElement;
  private suggestions: RefuelSuggestion[] = [];
  private loading = false;
  private error: string | null = null;
  private routeId: string | null = null;
  private vehicleId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.routeId = sessionStorage.getItem('currentRouteId');
    this.vehicleId = sessionStorage.getItem('selectedVehicleId');
  }

  async render(): Promise<void> {
    this.container.innerHTML = this.buildLoading();
    this.upgradeComponents();

    if (!this.routeId) {
      this.error = 'No route selected. Please calculate a route first.';
      this.container.innerHTML = this.buildTemplate();
      return;
    }

    if (!this.vehicleId) {
      this.error = 'No vehicle selected. Please select a vehicle profile first.';
      this.container.innerHTML = this.buildTemplate();
      return;
    }

    await this.loadSuggestions();
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private async loadSuggestions(): Promise<void> {
    this.loading = true;
    try {
      const res = await apiClient.post<RefuelSuggestion[]>(
        `/refuel/${this.routeId}/suggest`,
        { vehicleId: this.vehicleId }
      );
      this.suggestions = res.data;
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to load refuel suggestions.';
    } finally {
      this.loading = false;
    }
  }

  private buildTemplate(): string {
    if (this.error) {
      return `
        <div class="refuel-advisor-page">
          ${this.buildError()}
        </div>
      `;
    }

    if (this.loading) {
      return this.buildLoading();
    }

    return `
      <div class="refuel-advisor-page">
        <div class="mdl-card mdl-shadow--2dp app-card">
          <div class="mdl-card__title">
            <h2 class="mdl-card__title-text">
              <i class="material-icons">local_gas_station</i>&nbsp;Refuel Suggestions
            </h2>
          </div>
          <div class="mdl-card__supporting-text">
            ${this.suggestions.length === 0
              ? '<p>No refuel stops needed for this route with your current vehicle.</p>'
              : this.buildSuggestionsList()}
          </div>
        </div>
      </div>
    `;
  }

  private buildSuggestionsList(): string {
    return this.suggestions
      .map(
        (suggestion, index) => `
        <div class="refuel-suggestion" data-index="${index}"
             style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong>${suggestion.station.name}</strong>
              <span style="color:#666;margin-left:8px;">(${suggestion.station.countryCode})</span>
            </div>
            ${suggestion.expandedSearch
              ? `<span class="mdl-chip" style="background:#fff3cd;">
                   <span class="mdl-chip__text" style="font-size:11px;">
                     ⚠️ Detour (expanded search)
                   </span>
                 </span>`
              : ''}
          </div>

          <div style="margin-top:8px;display:flex;gap:16px;color:#666;font-size:0.9em;">
            <span>
              <i class="material-icons" style="font-size:16px;vertical-align:middle;">straighten</i>
              ${suggestion.distanceFromStart.toFixed(1)} km from start
            </span>
            ${suggestion.station.fuelPrice
              ? `<span>
                   <i class="material-icons" style="font-size:16px;vertical-align:middle;">euro</i>
                   €${suggestion.station.fuelPrice.toFixed(3)}/L
                 </span>`
              : ''}
            ${suggestion.station.distanceFromRouteKm
              ? `<span>
                   <i class="material-icons" style="font-size:16px;vertical-align:middle;">alt_route</i>
                   ${suggestion.station.distanceFromRouteKm.toFixed(1)} km from route
                 </span>`
              : ''}
          </div>

          <div style="margin-top:12px;display:flex;gap:8px;">
            <button class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored btn-accept"
                    data-index="${index}" data-station-id="${suggestion.station.id}">
              <i class="material-icons">check</i>&nbsp;Accept
            </button>
            <button class="mdl-button mdl-js-button mdl-button--raised btn-reject"
                    data-index="${index}" data-station-id="${suggestion.station.id}">
              <i class="material-icons">close</i>&nbsp;Reject
            </button>
          </div>

          ${suggestion.alternatives.length > 0
            ? `<details style="margin-top:8px;">
                 <summary style="cursor:pointer;color:#1976d2;font-size:0.9em;">
                   ${suggestion.alternatives.length} alternative(s) available
                 </summary>
                 <div style="margin-top:8px;">
                   ${suggestion.alternatives
                     .map(
                       (alt) => `
                     <div style="padding:8px;border-left:3px solid #e0e0e0;margin-bottom:4px;">
                       <strong>${alt.name}</strong>
                       ${alt.fuelPrice ? `— €${alt.fuelPrice.toFixed(3)}/L` : ''}
                       ${alt.distanceFromRouteKm ? `(${alt.distanceFromRouteKm.toFixed(1)} km from route)` : ''}
                     </div>`
                     )
                     .join('')}
                 </div>
               </details>`
            : ''}
        </div>
      `
      )
      .join('');
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
        <p>Finding best refuel stops...</p>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelectorAll('.btn-accept').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const stationId = target.dataset.stationId!;
        this.acceptStop(stationId);
      });
    });

    this.container.querySelectorAll('.btn-reject').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const index = parseInt(target.dataset.index!, 10);
        const stationId = target.dataset.stationId!;
        this.rejectStop(index, stationId);
      });
    });
  }

  private async acceptStop(stationId: string): Promise<void> {
    if (!this.routeId) return;

    try {
      await apiClient.post(`/refuel/${this.routeId}/accept/${stationId}`);
      // Remove accepted suggestion from list
      this.suggestions = this.suggestions.filter(
        (s) => s.station.id !== stationId
      );
      this.rerender();
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to accept refuel stop.';
      this.rerender();
    }
  }

  private async rejectStop(index: number, stationId: string): Promise<void> {
    if (!this.routeId) return;

    try {
      const res = await apiClient.post<RefuelSuggestion>(
        `/refuel/${this.routeId}/reject/${stationId}`
      );
      // Replace the rejected suggestion with the next-best alternative
      if (res.data) {
        this.suggestions[index] = res.data;
      } else {
        this.suggestions.splice(index, 1);
      }
      this.rerender();
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to reject refuel stop.';
      this.rerender();
    }
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
