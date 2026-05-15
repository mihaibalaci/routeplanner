/**
 * CostBreakdownPanel — Main panel component for displaying route cost breakdown.
 *
 * Manages a state machine (empty → loading → loaded → error) with a collapsed sub-state.
 * Integrates VehicleSelector and fetches cost data from the composite endpoint.
 *
 * Lifecycle:
 * - Instantiated by RoutePlannerPage with a container element
 * - Receives route events via public methods (setRouteCalculating, setRouteResult, setRouteFailed)
 * - Fetches cost data when both a route and vehicle profile are selected
 * - Destroyed when RoutePlannerPage unmounts
 */

import { apiClient } from '../api/client';
import type { CostBreakdownData, PanelState, VignetteDuration, RoadCosts } from '../services/costCalculations';
import { formatEur, calculateRoadCostsSubtotal } from '../services/costCalculations';
import { type VehicleProfileResponse } from './VehicleSelector';

export interface CostBreakdownPanelOptions {
  container: HTMLElement;
  onVehicleChange?: (vehicleId: string) => void;
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 5_000;

export class CostBreakdownPanel {
  private container: HTMLElement;

  private state: PanelState = 'empty';
  private collapsed: boolean = false;
  private costData: CostBreakdownData | null = null;
  private selectedVehicleId: string | null = null;
  private errorMessage: string | null = null;
  private retryCount: number = 0;
  private routeId: string | null = null;
  private durationOverrides: Record<string, VignetteDuration> = {};

  private selectedVehicleProfile: VehicleProfileResponse | null = null;
  private vehicleProfiles: VehicleProfileResponse[] = [];
  private abortController: AbortController | null = null;
  private timeoutWithData: boolean = false;

  constructor(options: CostBreakdownPanelOptions) {
    this.container = options.container;
    this.render();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Transition to loading state when route calculation starts.
   * empty → loading, loaded → loading
   */
  setRouteCalculating(): void {
    this.abortPendingRequest();
    this.state = 'loading';
    this.errorMessage = null;
    this.timeoutWithData = false;
    this.render();
  }

  /**
   * Transition to loaded state when route calculation succeeds.
   * loading → loaded (triggers cost fetch if vehicle selected)
   */
  setRouteResult(routeId: string): void {
    this.routeId = routeId;
    this.retryCount = 0;
    this.collapsed = false;
    this.durationOverrides = {};

    if (this.selectedVehicleId) {
      this.state = 'loading';
      this.render();
      this.fetchCostBreakdown();
    } else {
      // Route available but no vehicle selected — show empty with prompt
      this.state = 'empty';
      this.render();
    }
  }

  /**
   * Transition to empty state when route calculation fails.
   * loading → empty
   */
  setRouteFailed(): void {
    this.abortPendingRequest();
    this.state = 'empty';
    this.routeId = null;
    this.costData = null;
    this.errorMessage = null;
    this.retryCount = 0;
    this.timeoutWithData = false;
    this.render();
  }

  /**
   * Set available vehicle profiles for the VehicleSelector sub-component.
   */
  setVehicleProfiles(profiles: VehicleProfileResponse[]): void {
    this.vehicleProfiles = profiles;
  }

  /**
   * Get the current panel state (for testing/integration).
   */
  getState(): PanelState {
    return this.state;
  }

  /**
   * Get whether the panel is collapsed (for testing/integration).
   */
  isCollapsed(): boolean {
    return this.collapsed;
  }

  /**
   * Get the current retry count (for testing/integration).
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Get the current route ID (for testing/integration).
   */
  getRouteId(): string | null {
    return this.routeId;
  }

  /**
   * Get the current cost data (for testing/integration).
   */
  getCostData(): CostBreakdownData | null {
    return this.costData;
  }

  /**
   * Get the current error message (for testing/integration).
   */
  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  /**
   * Get whether the panel is showing timeout error with retained data (for testing/integration).
   */
  hasTimeoutWithData(): boolean {
    return this.timeoutWithData;
  }

  /**
   * Get the currently selected vehicle profile (for testing/integration).
   */
  getSelectedVehicleProfile(): VehicleProfileResponse | null {
    return this.selectedVehicleProfile;
  }

  /**
   * Clean up resources and remove DOM content.
   */
  destroy(): void {
    this.abortPendingRequest();
    this.container.innerHTML = '';
  }

  // ─── State Transitions (internal) ──────────────────────────────────────────

  private transitionToLoaded(data: CostBreakdownData): void {
    this.state = 'loaded';
    this.costData = data;
    this.errorMessage = null;
    this.retryCount = 0;
    this.collapsed = false;
    this.timeoutWithData = false;
    this.render();
  }

  private transitionToError(message: string, isTimeout: boolean = false): void {
    // Requirement 7.3: On timeout, retain previous data if available
    if (isTimeout && this.costData) {
      this.state = 'loaded';
      this.errorMessage = message;
      this.timeoutWithData = true;
    } else {
      this.state = 'error';
      this.errorMessage = message;
      this.timeoutWithData = false;
    }
    this.render();
  }

  /**
   * Set the selected vehicle externally (called by RoutePlannerPage when vehicle list selection changes).
   */
  setSelectedVehicle(vehicleId: string): void {
    this.selectedVehicleId = vehicleId;
    this.selectedVehicleProfile = this.vehicleProfiles.find(p => p.id === vehicleId) || null;

    if (this.routeId) {
      this.state = 'loading';
      this.retryCount = 0;
      this.render();
      this.fetchCostBreakdown();
    }
  }

  private handleRetry(): void {
    if (this.retryCount >= MAX_RETRIES) return;
    this.retryCount++;
    this.state = 'loading';
    this.errorMessage = null;
    this.timeoutWithData = false;
    this.render();
    this.fetchCostBreakdown();
  }

  private handleToggleCollapse(): void {
    if (this.state !== 'loaded') return;
    this.collapsed = !this.collapsed;
    this.render();
  }

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  private async fetchCostBreakdown(): Promise<void> {
    if (!this.routeId || !this.selectedVehicleId) return;

    this.abortPendingRequest();
    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, TIMEOUT_MS);

    try {
      const params: Record<string, string> = {
        vehicleId: this.selectedVehicleId,
      };

      if (Object.keys(this.durationOverrides).length > 0) {
        params.durations = JSON.stringify(this.durationOverrides);
      }

      const response = await apiClient.get<CostBreakdownData>(
        `/cost-breakdown/${this.routeId}`,
        params,
        { signal: this.abortController.signal }
      );

      this.transitionToLoaded(response.data);
    } catch (error: unknown) {
      // AbortError is thrown when the signal is aborted (timeout or manual cancel)
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.transitionToError('Request timed out. Please check your connection.', true);
        return;
      }

      const apiError = error as { status?: number; message?: string };

      if (apiError.status === 401) {
        this.transitionToError('Login required to view cost estimates.');
      } else if (apiError.status === 400) {
        this.transitionToError(apiError.message || 'Route needs to be calculated first.');
      } else if (apiError.status === 404) {
        this.transitionToError('Route not found. Please recalculate your route.');
      } else {
        this.transitionToError(
          apiError.message || 'Failed to load cost breakdown. Please try again.'
        );
      }
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  private abortPendingRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  /**
   * Render the panel based on current state.
   * Detailed rendering logic for each state will be implemented in tasks 5.2–5.6.
   */
  render(): void {
    this.container.innerHTML = '';

    // Create panel wrapper
    const panel = document.createElement('div');
    panel.className = 'cost-breakdown-panel';
    panel.setAttribute('data-state', this.state);

    // Content area based on state
    const content = document.createElement('div');
    content.className = 'cost-breakdown-panel__content';

    switch (this.state) {
      case 'empty':
        content.innerHTML = this.renderEmpty();
        break;
      case 'loading':
        content.innerHTML = this.renderLoading();
        break;
      case 'loaded':
        content.innerHTML = this.renderLoaded();
        this.bindLoadedEvents(content);
        break;
      case 'error':
        content.innerHTML = this.renderError();
        this.bindErrorEvents(content);
        break;
    }

    panel.appendChild(content);
    this.container.appendChild(panel);
  }

  private renderEmpty(): string {
    const hasRoute = !!this.routeId;
    const icon = hasRoute ? 'directions_car' : 'route';
    const title = hasRoute ? 'Select a vehicle' : 'No route available';
    const text = hasRoute
      ? 'Choose a vehicle from the list above to see cost estimates'
      : 'Calculate a route to see cost estimates';

    return `
      <div class="cost-breakdown-panel__empty">
        <span class="material-symbols-rounded cost-breakdown-panel__icon">${icon}</span>
        <h3 class="cost-breakdown-panel__title">${title}</h3>
        <p class="cost-breakdown-panel__text">${text}</p>
      </div>
    `;
  }

  private renderLoading(): string {
    return `
      <div class="cost-breakdown-panel__loading">
        <div class="cost-breakdown-panel__spinner"></div>
        <p class="cost-breakdown-panel__text">Calculating costs...</p>
      </div>
    `;
  }

  private renderLoaded(): string {
    const totalFormatted = formatEur(this.costData?.totalCostEur ?? 0);
    const isPartial = this.costData?.isPartialEstimate ?? false;
    const partialLabel = isPartial
      ? '<span class="cost-breakdown-panel__partial-label">Partial estimate</span>'
      : '';

    // Error banner for timeout-with-data scenario (Req 7.3)
    const errorBanner = this.timeoutWithData && this.errorMessage
      ? this.renderErrorBanner()
      : '';

    if (this.collapsed) {
      return `
        ${errorBanner}
        <div class="cost-breakdown-panel__header">
          <span class="cost-breakdown-panel__total">${totalFormatted}</span>
          ${partialLabel}
          <button class="cost-breakdown-panel__toggle" aria-expanded="false" aria-label="Expand cost breakdown">
            <span class="material-symbols-rounded">expand_more</span>
          </button>
        </div>
      `;
    }

    return `
      ${errorBanner}
      <div class="cost-breakdown-panel__header">
        <span class="cost-breakdown-panel__total">${totalFormatted}</span>
        ${partialLabel}
        <button class="cost-breakdown-panel__toggle" aria-expanded="true" aria-label="Collapse cost breakdown">
          <span class="material-symbols-rounded">expand_less</span>
        </button>
      </div>
      <div class="cost-breakdown-panel__details">
        ${this.isSelectedVehicleEv() ? this.renderEnergySection() : this.renderFuelSection()}
        ${this.renderRoadCostsSection()}
      </div>
    `;
  }

  private renderErrorBanner(): string {
    const retryDisabled = this.retryCount >= MAX_RETRIES;
    return `
      <div class="cost-breakdown-panel__error-banner" role="alert">
        <span class="material-symbols-rounded cost-breakdown-panel__error-banner-icon">warning</span>
        <p class="cost-breakdown-panel__error-banner-message">${this.errorMessage}</p>
        <button
          class="cost-breakdown-panel__retry-btn"
          ${retryDisabled ? 'disabled' : ''}
          aria-label="Retry cost calculation"
        >
          ${retryDisabled ? 'Max retries reached' : 'Retry'}
        </button>
      </div>
    `;
  }

  private renderFuelSection(): string {
    if (!this.costData) return '';

    const { fuel } = this.costData;
    const rows = fuel.breakdown
      .map(
        (entry) => `
        <tr class="cost-breakdown-panel__fuel-row">
          <td class="cost-breakdown-panel__country-name">${entry.countryName}</td>
          <td class="cost-breakdown-panel__distance">${Math.round(entry.distanceKm)} km</td>
          <td class="cost-breakdown-panel__cost">${formatEur(entry.fuelCostEur)}</td>
        </tr>`
      )
      .join('');

    return `
      <section class="cost-breakdown-panel__section cost-breakdown-panel__fuel-section">
        <h4 class="cost-breakdown-panel__section-title">
          Fuel
          <span class="cost-breakdown-panel__section-total">${formatEur(fuel.totalFuelCostEur)}</span>
        </h4>
        <table class="cost-breakdown-panel__breakdown-table">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    `;
  }

  /**
   * Check if the currently selected vehicle is an EV.
   */
  private isSelectedVehicleEv(): boolean {
    return this.selectedVehicleProfile?.vehicle_type === 'ev';
  }

  /**
   * Render energy consumption section for EV vehicles.
   * Shows kWh consumed based on total route distance and consumption_kwh_per_100km.
   */
  private renderEnergySection(): string {
    if (!this.costData || !this.selectedVehicleProfile) return '';

    const consumptionKwhPer100km = this.selectedVehicleProfile.consumption_kwh_per_100km;
    if (!consumptionKwhPer100km) return '';

    // Calculate total distance from fuel breakdown (reuse existing distance data)
    const totalDistanceKm = this.costData.fuel.breakdown.reduce(
      (sum, entry) => sum + entry.distanceKm,
      0
    );

    // Calculate total energy consumed: (distance / 100) * consumption_kwh_per_100km
    const totalEnergyKwh = (totalDistanceKm / 100) * consumptionKwhPer100km;
    const totalEnergyRounded = Math.round(totalEnergyKwh * 100) / 100;

    const rows = this.costData.fuel.breakdown
      .map((entry) => {
        const segmentEnergy = (entry.distanceKm / 100) * consumptionKwhPer100km;
        const segmentEnergyRounded = Math.round(segmentEnergy * 100) / 100;
        return `
        <tr class="cost-breakdown-panel__energy-row">
          <td class="cost-breakdown-panel__country-name">${entry.countryName}</td>
          <td class="cost-breakdown-panel__distance">${Math.round(entry.distanceKm)} km</td>
          <td class="cost-breakdown-panel__energy">${segmentEnergyRounded.toFixed(2)} kWh</td>
        </tr>`;
      })
      .join('');

    return `
      <section class="cost-breakdown-panel__section cost-breakdown-panel__energy-section">
        <h4 class="cost-breakdown-panel__section-title">
          Energy
          <span class="cost-breakdown-panel__section-total">${totalEnergyRounded.toFixed(2)} kWh</span>
        </h4>
        <table class="cost-breakdown-panel__breakdown-table">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderRoadCostsSection(): string {
    if (!this.costData) return '';

    const { roadCosts } = this.costData;
    const subtotal = calculateRoadCostsSubtotal(roadCosts);

    return `
      <section class="cost-breakdown-panel__section cost-breakdown-panel__road-costs-section">
        <h4 class="cost-breakdown-panel__section-title">
          Road Costs
          <span class="cost-breakdown-panel__section-total">${formatEur(subtotal)}</span>
        </h4>
        ${this.renderVignettesGroup(roadCosts)}
        ${this.renderBridgeTollsGroup(roadCosts)}
        ${this.renderHighwayTollsGroup(roadCosts)}
        <div class="cost-breakdown-panel__subtotal">
          <span class="cost-breakdown-panel__subtotal-label">Road costs subtotal</span>
          <span class="cost-breakdown-panel__subtotal-value">${formatEur(subtotal)}</span>
        </div>
      </section>
    `;
  }

  private renderVignettesGroup(roadCosts: RoadCosts): string {
    if (roadCosts.vignettes.length === 0) {
      return `
        <div class="cost-breakdown-panel__group cost-breakdown-panel__vignettes-group">
          <h5 class="cost-breakdown-panel__group-title">Vignettes</h5>
          <p class="cost-breakdown-panel__no-vignettes">No vignettes required</p>
        </div>
      `;
    }

    const rows = roadCosts.vignettes
      .map((entry) => {
        const durationOptions = entry.availableDurations
          .map((dur) => {
            const selected = dur === entry.duration ? ' selected' : '';
            return `<option value="${dur}"${selected}>${dur}</option>`;
          })
          .join('');

        return `
          <tr class="cost-breakdown-panel__vignette-row">
            <td class="cost-breakdown-panel__country-name">${entry.countryName}</td>
            <td class="cost-breakdown-panel__duration">
              <select
                class="cost-breakdown-panel__duration-select"
                data-country-code="${entry.countryCode}"
                aria-label="Vignette duration for ${entry.countryName}"
              >
                ${durationOptions}
              </select>
            </td>
            <td class="cost-breakdown-panel__cost">${formatEur(entry.cost)}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="cost-breakdown-panel__group cost-breakdown-panel__vignettes-group">
        <h5 class="cost-breakdown-panel__group-title">Vignettes</h5>
        <table class="cost-breakdown-panel__breakdown-table">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderBridgeTollsGroup(roadCosts: RoadCosts): string {
    if (roadCosts.bridgeTolls.length === 0) {
      return '';
    }

    const rows = roadCosts.bridgeTolls
      .map(
        (entry) => `
        <tr class="cost-breakdown-panel__bridge-toll-row">
          <td class="cost-breakdown-panel__toll-name">${entry.name}</td>
          <td class="cost-breakdown-panel__cost">${formatEur(entry.cost)}</td>
        </tr>`
      )
      .join('');

    return `
      <div class="cost-breakdown-panel__group cost-breakdown-panel__bridge-tolls-group">
        <h5 class="cost-breakdown-panel__group-title">Bridge Tolls</h5>
        <table class="cost-breakdown-panel__breakdown-table">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderHighwayTollsGroup(roadCosts: RoadCosts): string {
    if (roadCosts.highwayTolls.length === 0) {
      return '';
    }

    const rows = roadCosts.highwayTolls
      .map(
        (entry) => `
        <tr class="cost-breakdown-panel__highway-toll-row">
          <td class="cost-breakdown-panel__toll-name">${entry.segment}</td>
          <td class="cost-breakdown-panel__cost">${formatEur(entry.cost)}</td>
        </tr>`
      )
      .join('');

    return `
      <div class="cost-breakdown-panel__group cost-breakdown-panel__highway-tolls-group">
        <h5 class="cost-breakdown-panel__group-title">Highway Tolls</h5>
        <table class="cost-breakdown-panel__breakdown-table">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderError(): string {
    const retryDisabled = this.retryCount >= MAX_RETRIES;
    return `
      <div class="cost-breakdown-panel__error">
        <span class="material-symbols-rounded cost-breakdown-panel__icon">error</span>
        <p class="cost-breakdown-panel__error-message">${this.errorMessage ?? 'An error occurred'}</p>
        <button
          class="cost-breakdown-panel__retry-btn"
          ${retryDisabled ? 'disabled' : ''}
          aria-label="Retry cost calculation"
        >
          ${retryDisabled ? 'Max retries reached' : 'Retry'}
        </button>
      </div>
    `;
  }

  // ─── Event Binding ──────────────────────────────────────────────────────────

  private bindLoadedEvents(content: HTMLElement): void {
    const toggleBtn = content.querySelector('.cost-breakdown-panel__toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.handleToggleCollapse());
    }

    // Bind retry button in error banner (timeout-with-data scenario, Req 7.3)
    const retryBtn = content.querySelector('.cost-breakdown-panel__retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.handleRetry());
    }

    // Bind duration change events for vignette selects
    const durationSelects = content.querySelectorAll<HTMLSelectElement>(
      '.cost-breakdown-panel__duration-select'
    );
    durationSelects.forEach((select) => {
      select.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const countryCode = target.getAttribute('data-country-code');
        if (countryCode) {
          this.handleDurationChange(countryCode, target.value);
        }
      });
    });
  }

  private handleDurationChange(countryCode: string, duration: string): void {
    this.durationOverrides[countryCode] = duration as VignetteDuration;
    this.fetchCostBreakdown();
  }

  private bindErrorEvents(content: HTMLElement): void {
    const retryBtn = content.querySelector('.cost-breakdown-panel__retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.handleRetry());
    }
  }
}
