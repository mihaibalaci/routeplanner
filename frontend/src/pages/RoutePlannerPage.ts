/**
 * Route Planner Page — Uses Google Maps for route calculation
 */
import { loadGoogleMaps, isMapsAvailable, createMap } from '../services/mapService';
import { apiClient } from '../api/client';
import { CostBreakdownPanel } from '../components/CostBreakdownPanel';
import type { VehicleProfileResponse } from '../components/VehicleSelector';

export class RoutePlannerPage {
  private container: HTMLElement;
  private map: any = null;
  private calculating = false;
  private error: string | null = null;
  private routeResult: { distance: string; duration: string } | null = null;
  private costBreakdownPanel: CostBreakdownPanel | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
    this.initMap();
    this.initCostBreakdownPanel();
    this.initResponsiveLayout();
  }

  private build(): string {
    return `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Route Planner</h1>
          <p class="page-header__subtitle">Plan your multi-stop driving route across Europe.</p>
        </div>

        ${this.error ? `<div class="alert alert--error" style="margin-bottom:var(--space-4);">${this.error}</div>` : ''}

        <div class="route-planner-layout">
          <div class="route-planner-layout__main">
            <div style="display:grid;grid-template-columns:380px 1fr;gap:var(--space-4);min-height:500px;">
              <div class="card" style="align-self:start;">
                <div class="card__title" style="margin-bottom:var(--space-4);">Waypoints</div>
                <div style="display:flex;flex-direction:column;gap:var(--space-3);">
                  <div class="input-group">
                    <label class="input-group__label">Origin</label>
                    <input class="input" type="text" id="origin-input" placeholder="Starting point" />
                  </div>
                  <div id="stops-container"></div>
                  <div class="input-group">
                    <label class="input-group__label">Destination</label>
                    <input class="input" type="text" id="dest-input" placeholder="Final destination" />
                  </div>
                  <button id="btn-add-stop" class="btn btn--ghost" style="align-self:flex-start;">
                    <span class="material-symbols-rounded">add_location</span> Add Stop
                  </button>
                </div>
                <div style="margin-top:var(--space-4);">
                  <button id="btn-calculate" class="btn btn--primary btn--lg" style="width:100%;" ${this.calculating ? 'disabled' : ''}>
                    ${this.calculating ? '<span class="spinner" style="width:16px;height:16px;"></span> Calculating...' : '<span class="material-symbols-rounded">directions</span> Calculate Route'}
                  </button>
                </div>

                ${this.routeResult ? `
                <div style="margin-top:var(--space-4);padding:var(--space-4);background:var(--color-primary-50);border-radius:var(--radius-lg);">
                  <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-2);">
                    <span style="color:var(--color-text-secondary);font-size:var(--font-size-sm);">Distance</span>
                    <strong>${this.routeResult.distance}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;">
                    <span style="color:var(--color-text-secondary);font-size:var(--font-size-sm);">Duration</span>
                    <strong>${this.routeResult.duration}</strong>
                  </div>
                </div>
                ` : ''}
              </div>

              <div class="card" style="padding:0;overflow:hidden;min-height:500px;">
                <div id="map-container" style="width:100%;height:100%;min-height:500px;"></div>
              </div>
            </div>
          </div>

          <div id="cost-breakdown-container" class="route-planner-layout__sidebar"></div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-add-stop')?.addEventListener('click', () => this.addStop());
    this.container.querySelector('#btn-calculate')?.addEventListener('click', () => this.calculateRoute());
  }

  private initCostBreakdownPanel(): void {
    const panelContainer = this.container.querySelector('#cost-breakdown-container') as HTMLElement;
    if (!panelContainer) return;

    this.costBreakdownPanel = new CostBreakdownPanel({
      container: panelContainer,
    });

    this.loadVehicleProfiles();
  }

  private initResponsiveLayout(): void {
    this.mediaQuery = window.matchMedia('(min-width: 1024px)');

    // Apply initial layout class
    this.applyLayoutClass(this.mediaQuery.matches);

    // Listen for breakpoint changes
    this.mediaQueryHandler = (e: MediaQueryListEvent) => {
      this.applyLayoutClass(e.matches);
    };
    this.mediaQuery.addEventListener('change', this.mediaQueryHandler);
  }

  private applyLayoutClass(isDesktop: boolean): void {
    const layoutEl = this.container.querySelector('.route-planner-layout') as HTMLElement;
    if (!layoutEl) return;

    if (isDesktop) {
      layoutEl.classList.add('route-planner-layout--desktop');
      layoutEl.classList.remove('route-planner-layout--mobile');
    } else {
      layoutEl.classList.add('route-planner-layout--mobile');
      layoutEl.classList.remove('route-planner-layout--desktop');
    }
  }

  private destroyResponsiveLayout(): void {
    if (this.mediaQuery && this.mediaQueryHandler) {
      this.mediaQuery.removeEventListener('change', this.mediaQueryHandler);
      this.mediaQuery = null;
      this.mediaQueryHandler = null;
    }
  }

  private async loadVehicleProfiles(): Promise<void> {
    if (!apiClient.isAuthenticated()) return;

    try {
      const response = await apiClient.get<VehicleProfileResponse[]>('/vehicles');
      if (response.data && this.costBreakdownPanel) {
        this.costBreakdownPanel.setVehicleProfiles(response.data);
      }
    } catch {
      // Vehicle profiles unavailable — panel will show appropriate state
    }
  }

  private async initMap(): Promise<void> {
    const mapContainer = this.container.querySelector('#map-container') as HTMLElement;
    if (!mapContainer) return;

    try {
      await loadGoogleMaps();
      this.map = createMap(mapContainer);
      // Attach Places Autocomplete to inputs
      this.attachAutocomplete('origin-input');
      this.attachAutocomplete('dest-input');
    } catch {
      mapContainer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);text-align:center;padding:var(--space-4);">
          <div>
            <span class="material-symbols-rounded" style="font-size:48px;">map</span>
            <p style="margin-top:var(--space-2);font-size:var(--font-size-sm);">Map unavailable. Check Google Maps API key.</p>
          </div>
        </div>
      `;
    }
  }

  private attachAutocomplete(inputId: string): void {
    if (!isMapsAvailable()) return;
    const input = this.container.querySelector(`#${inputId}`) as HTMLInputElement;
    if (!input) return;

    const google = (window as any).google;
    new google.maps.places.Autocomplete(input, {
      types: ['geocode', 'establishment'],
      fields: ['place_id', 'geometry', 'formatted_address'],
    });
  }

  private addStop(): void {
    const container = this.container.querySelector('#stops-container');
    if (!container) return;
    const count = container.children.length;
    const div = document.createElement('div');
    div.className = 'input-group';
    div.style.cssText = 'display:flex;gap:var(--space-2);align-items:end;';
    div.innerHTML = `
      <div style="flex:1;">
        <label class="input-group__label">Stop ${count + 1}</label>
        <input class="input stop-input" type="text" placeholder="Intermediate stop" />
      </div>
      <button class="btn btn--ghost btn-remove-stop" style="padding:var(--space-2);">
        <span class="material-symbols-rounded">close</span>
      </button>
    `;
    div.querySelector('.btn-remove-stop')?.addEventListener('click', () => div.remove());
    container.appendChild(div);

    // Attach autocomplete to the new input
    if (isMapsAvailable()) {
      const input = div.querySelector('.stop-input') as HTMLInputElement;
      const google = (window as any).google;
      new google.maps.places.Autocomplete(input, {
        types: ['geocode', 'establishment'],
        fields: ['place_id', 'geometry', 'formatted_address'],
      });
    }
  }

  private async calculateRoute(): Promise<void> {
    const origin = (this.container.querySelector('#origin-input') as HTMLInputElement)?.value.trim();
    const dest = (this.container.querySelector('#dest-input') as HTMLInputElement)?.value.trim();

    if (!origin || !dest) {
      this.error = 'Please enter both origin and destination.';
      this.rerender();
      return;
    }

    if (!isMapsAvailable()) {
      this.error = 'Google Maps is not loaded. Please refresh the page.';
      this.rerender();
      return;
    }

    this.calculating = true;
    this.error = null;
    this.routeResult = null;
    this.costBreakdownPanel?.setRouteCalculating();
    // Update button without full rerender (preserve map)
    const btn = this.container.querySelector('#btn-calculate') as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span> Calculating...'; }

    try {
      const google = (window as any).google;
      const directionsService = new google.maps.DirectionsService();
      const directionsRenderer = new google.maps.DirectionsRenderer({ map: this.map });

      // Collect intermediate stops
      const stopInputs = this.container.querySelectorAll('.stop-input') as NodeListOf<HTMLInputElement>;
      const waypoints = Array.from(stopInputs)
        .map(input => input.value.trim())
        .filter(v => v.length > 0)
        .map(v => ({ location: v, stopover: true }));

      const request: any = {
        origin,
        destination: dest,
        travelMode: google.maps.TravelMode.DRIVING,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
      };

      directionsService.route(request, (result: any, status: any) => {
        this.calculating = false;
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
          // Extract total distance and duration
          const route = result.routes[0];
          let totalDistance = 0;
          let totalDuration = 0;
          route.legs.forEach((leg: any) => {
            totalDistance += leg.distance.value;
            totalDuration += leg.duration.value;
          });
          this.routeResult = {
            distance: `${(totalDistance / 1000).toFixed(1)} km`,
            duration: this.formatDuration(totalDuration),
          };
          this.updateResultsUI();
          this.saveRouteToBackend(result);
        } else {
          this.error = `Route calculation failed: ${status}`;
          this.updateResultsUI();
          this.costBreakdownPanel?.setRouteFailed();
        }
      });
    } catch (err) {
      this.calculating = false;
      this.error = `Error: ${(err as Error).message}`;
      this.updateResultsUI();
      this.costBreakdownPanel?.setRouteFailed();
    }
  }

  private async saveRouteToBackend(directionsResult: any): Promise<void> {
    if (!apiClient.isAuthenticated()) {
      this.costBreakdownPanel?.setRouteFailed();
      return;
    }

    try {
      const route = directionsResult.routes[0];
      const legs = route.legs;

      // Build waypoints from the directions result
      const backendWaypoints: Array<{
        latitude: number;
        longitude: number;
        label: string;
        waypoint_type: string;
      }> = [];

      // Origin
      const originLeg = legs[0];
      backendWaypoints.push({
        latitude: originLeg.start_location.lat(),
        longitude: originLeg.start_location.lng(),
        label: originLeg.start_address || 'Origin',
        waypoint_type: 'origin',
      });

      // Intermediate stops
      for (let i = 0; i < legs.length - 1; i++) {
        backendWaypoints.push({
          latitude: legs[i].end_location.lat(),
          longitude: legs[i].end_location.lng(),
          label: legs[i].end_address || `Stop ${i + 1}`,
          waypoint_type: 'stop',
        });
      }

      // Destination
      const lastLeg = legs[legs.length - 1];
      backendWaypoints.push({
        latitude: lastLeg.end_location.lat(),
        longitude: lastLeg.end_location.lng(),
        label: lastLeg.end_address || 'Destination',
        waypoint_type: 'destination',
      });

      // Create route on backend
      const createResponse = await apiClient.post<{ id: string }>('/routes', {
        name: 'Route Planner Calculation',
        waypoints: backendWaypoints,
      });

      const routeId = createResponse.data.id;

      // Trigger backend route calculation to store segments
      await apiClient.post(`/routes/${routeId}/calculate`);

      // Notify the cost breakdown panel with the route ID
      this.costBreakdownPanel?.setRouteResult(routeId);
    } catch {
      // Backend save failed — notify panel
      this.costBreakdownPanel?.setRouteFailed();
    }
  }

  private updateResultsUI(): void {
    // Update just the button and results area without destroying the map
    const btn = this.container.querySelector('#btn-calculate') as HTMLButtonElement;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">directions</span> Calculate Route';
    }

    // Remove old error/result
    this.container.querySelector('.alert--error')?.remove();
    this.container.querySelector('[style*="primary-50"]')?.remove();

    if (this.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'alert alert--error';
      errorDiv.style.marginBottom = 'var(--space-4)';
      errorDiv.textContent = this.error;
      const header = this.container.querySelector('.page-header');
      header?.insertAdjacentElement('afterend', errorDiv);
    }

    if (this.routeResult) {
      const resultDiv = document.createElement('div');
      resultDiv.style.cssText = 'margin-top:var(--space-4);padding:var(--space-4);background:var(--color-primary-50);border-radius:var(--radius-lg);';
      resultDiv.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-2);">
          <span style="color:var(--color-text-secondary);font-size:var(--font-size-sm);">Distance</span>
          <strong>${this.routeResult.distance}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:var(--color-text-secondary);font-size:var(--font-size-sm);">Duration</span>
          <strong>${this.routeResult.duration}</strong>
        </div>
      `;
      const calcBtn = this.container.querySelector('#btn-calculate');
      calcBtn?.insertAdjacentElement('afterend', resultDiv);
    }
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  }

  private rerender(): void {
    this.destroyResponsiveLayout();
    this.container.innerHTML = this.build();
    this.bindEvents();
    this.initMap();
    this.initCostBreakdownPanel();
    this.initResponsiveLayout();
  }
}
