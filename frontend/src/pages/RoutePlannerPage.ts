/**
 * Route Planner Page
 *
 * Full route planning UI with:
 * - Google Maps container
 * - Waypoint input panel with autocomplete
 * - Add/remove/reorder waypoints
 * - Calculate route button with loading indicator
 * - Route info panel (total distance, duration, per-segment)
 * - Alternative routes display and selection
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.3
 */

import { apiClient } from '../api/client';
import { mapService } from '../services/mapService';

interface Waypoint {
  id: string;
  label: string;
  placeId: string;
  lat: number;
  lng: number;
  type: 'origin' | 'stop' | 'destination';
}

interface RouteSegment {
  startLabel: string;
  endLabel: string;
  distanceKm: number;
  durationSeconds: number;
}

interface RouteData {
  id: string;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  polylineEncoded: string;
  segments: RouteSegment[];
}

interface AlternativeRoute {
  index: number;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  polylineEncoded: string;
}

export class RoutePlannerPage {
  private container: HTMLElement;
  private waypoints: Waypoint[] = [];
  private currentRouteId: string | null = null;
  private routeData: RouteData | null = null;
  private alternatives: AlternativeRoute[] = [];
  private isCalculating = false;
  private mapInitialized = false;

  constructor(container: HTMLElement) {
    this.container = container;
    // Start with origin and destination
    this.waypoints = [
      this.createEmptyWaypoint('origin'),
      this.createEmptyWaypoint('destination'),
    ];
  }

  render(): void {
    this.container.innerHTML = this.buildHTML();
    this.bindEvents();
    this.initializeMap();
    this.setupAutocomplete();
    this.upgradeComponents();
  }

  private buildHTML(): string {
    return `
      <div class="route-planner">
        <div class="route-planner__panel">
          ${this.buildWaypointPanel()}
          ${this.buildRouteInfoPanel()}
          ${this.buildAlternativesPanel()}
        </div>
        <div class="route-planner__map">
          <div id="route-map" class="route-map-container"></div>
          ${this.buildLoadingOverlay()}
        </div>
      </div>
    `;
  }

  private buildWaypointPanel(): string {
    const waypointInputs = this.waypoints
      .map((wp, index) => this.buildWaypointInput(wp, index))
      .join('');

    return `
      <div class="mdl-card mdl-shadow--2dp route-panel-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">map</i>&nbsp;Plan Your Route
          </h2>
        </div>
        <div class="mdl-card__supporting-text">
          <div id="waypoint-list" class="waypoint-list">
            ${waypointInputs}
          </div>
          <div class="waypoint-actions">
            <button id="btn-add-stop"
                    class="mdl-button mdl-js-button mdl-button--icon mdl-button--colored"
                    title="Add intermediate stop">
              <i class="material-icons">add_location</i>
            </button>
            <span class="waypoint-actions__label">Add Stop</span>
          </div>
        </div>
        <div class="mdl-card__actions mdl-card--border">
          <button id="btn-calculate"
                  class="mdl-button mdl-button--raised mdl-button--colored mdl-js-button mdl-js-ripple-effect">
            <i class="material-icons">directions</i>&nbsp;Calculate Route
          </button>
        </div>
      </div>
    `;
  }

  private buildWaypointInput(wp: Waypoint, index: number): string {
    const isOrigin = wp.type === 'origin';
    const isDestination = wp.type === 'destination';
    const icon = isOrigin ? 'trip_origin' : isDestination ? 'place' : 'more_vert';
    const placeholder = isOrigin
      ? 'Enter origin...'
      : isDestination
        ? 'Enter destination...'
        : `Stop ${index}...`;

    const removeBtn =
      !isOrigin && !isDestination
        ? `<button class="mdl-button mdl-button--icon btn-remove-waypoint" data-index="${index}" title="Remove stop">
             <i class="material-icons">close</i>
           </button>`
        : '';

    const moveButtons =
      !isOrigin && !isDestination
        ? `<button class="mdl-button mdl-button--icon btn-move-up" data-index="${index}" title="Move up"
                   ${index <= 1 ? 'disabled' : ''}>
             <i class="material-icons">arrow_upward</i>
           </button>
           <button class="mdl-button mdl-button--icon btn-move-down" data-index="${index}" title="Move down"
                   ${index >= this.waypoints.length - 2 ? 'disabled' : ''}>
             <i class="material-icons">arrow_downward</i>
           </button>`
        : '';

    return `
      <div class="waypoint-input" data-index="${index}" data-waypoint-id="${wp.id}">
        <i class="material-icons waypoint-input__icon">${icon}</i>
        <div class="mdl-textfield mdl-js-textfield waypoint-input__field">
          <input class="mdl-textfield__input waypoint-autocomplete"
                 type="text"
                 id="waypoint-input-${wp.id}"
                 data-waypoint-id="${wp.id}"
                 value="${wp.label}"
                 placeholder="${placeholder}"
                 autocomplete="off" />
        </div>
        <div class="waypoint-input__actions">
          ${moveButtons}
          ${removeBtn}
        </div>
      </div>
    `;
  }

  private buildRouteInfoPanel(): string {
    if (!this.routeData) return '';

    const totalDistance = this.routeData.totalDistanceKm.toFixed(1);
    const totalDuration = this.formatDuration(this.routeData.totalDurationSeconds);

    const segmentRows = this.routeData.segments
      .map(
        (seg) => `
        <tr>
          <td class="mdl-data-table__cell--non-numeric">${seg.startLabel} → ${seg.endLabel}</td>
          <td>${seg.distanceKm.toFixed(1)} km</td>
          <td>${this.formatDuration(seg.durationSeconds)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <div class="mdl-card mdl-shadow--2dp route-panel-card route-info-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">info</i>&nbsp;Route Summary
          </h2>
        </div>
        <div class="mdl-card__supporting-text">
          <div class="route-totals">
            <div class="route-total-item">
              <i class="material-icons">straighten</i>
              <span class="route-total-value">${totalDistance} km</span>
              <span class="route-total-label">Total Distance</span>
            </div>
            <div class="route-total-item">
              <i class="material-icons">schedule</i>
              <span class="route-total-value">${totalDuration}</span>
              <span class="route-total-label">Estimated Time</span>
            </div>
          </div>
          ${
            this.routeData.segments.length > 0
              ? `
            <h6 class="segment-heading">Per-Segment Breakdown</h6>
            <table class="mdl-data-table mdl-js-data-table segment-table">
              <thead>
                <tr>
                  <th class="mdl-data-table__cell--non-numeric">Segment</th>
                  <th>Distance</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                ${segmentRows}
              </tbody>
            </table>
          `
              : ''
          }
        </div>
        <div class="mdl-card__actions mdl-card--border">
          <button id="btn-show-alternatives"
                  class="mdl-button mdl-js-button mdl-button--colored mdl-js-ripple-effect">
            <i class="material-icons">alt_route</i>&nbsp;Show Alternatives
          </button>
        </div>
      </div>
    `;
  }

  private buildAlternativesPanel(): string {
    if (this.alternatives.length === 0) return '';

    const altItems = this.alternatives
      .map(
        (alt, i) => `
        <li class="alternative-item">
          <span class="alternative-label">Route ${i + 1}</span>
          <span class="alternative-info">
            ${alt.totalDistanceKm.toFixed(1)} km · ${this.formatDuration(alt.totalDurationSeconds)}
          </span>
          <button class="mdl-button mdl-button--raised mdl-js-button btn-select-alternative"
                  data-alt-index="${i}">
            Select
          </button>
        </li>
      `
      )
      .join('');

    return `
      <div class="mdl-card mdl-shadow--2dp route-panel-card alternatives-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">alt_route</i>&nbsp;Alternative Routes
          </h2>
        </div>
        <div class="mdl-card__supporting-text">
          <ul class="alternatives-list">
            ${altItems}
          </ul>
        </div>
      </div>
    `;
  }

  private buildLoadingOverlay(): string {
    return `
      <div id="map-loading" class="map-loading ${this.isCalculating ? 'is-visible' : ''}">
        <div class="mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active"></div>
        <span class="map-loading__text">Calculating route...</span>
      </div>
    `;
  }

  // --- Event Binding ---

  private bindEvents(): void {
    // Add stop button
    const addBtn = this.container.querySelector('#btn-add-stop');
    addBtn?.addEventListener('click', () => this.addStop());

    // Calculate route button
    const calcBtn = this.container.querySelector('#btn-calculate');
    calcBtn?.addEventListener('click', () => this.calculateRoute());

    // Remove waypoint buttons
    this.container.querySelectorAll('.btn-remove-waypoint').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
        this.removeWaypoint(index);
      });
    });

    // Move up/down buttons
    this.container.querySelectorAll('.btn-move-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
        this.moveWaypoint(index, 'up');
      });
    });

    this.container.querySelectorAll('.btn-move-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
        this.moveWaypoint(index, 'down');
      });
    });

    // Show alternatives button
    const altBtn = this.container.querySelector('#btn-show-alternatives');
    altBtn?.addEventListener('click', () => this.showAlternatives());

    // Select alternative buttons
    this.container.querySelectorAll('.btn-select-alternative').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).dataset.altIndex || '0', 10);
        this.selectAlternative(index);
      });
    });
  }

  // --- Map Initialization ---

  private initializeMap(): void {
    const mapContainer = this.container.querySelector('#route-map') as HTMLElement;
    if (!mapContainer) return;

    // Check if Google Maps is loaded
    if (typeof window.google === 'undefined' || !window.google.maps) {
      mapContainer.innerHTML = `
        <div class="map-placeholder">
          <i class="material-icons">map</i>
          <p>Google Maps is loading...</p>
          <p class="map-placeholder__hint">Ensure the Google Maps API key is configured.</p>
        </div>
      `;
      return;
    }

    mapService.initMap(mapContainer);
    this.mapInitialized = true;

    // If we already have waypoints with coordinates, show them
    this.updateMapDisplay();
  }

  // --- Autocomplete Setup ---

  private setupAutocomplete(): void {
    if (typeof window.google === 'undefined' || !window.google.maps) return;

    this.waypoints.forEach((wp) => {
      const input = this.container.querySelector(
        `#waypoint-input-${wp.id}`
      ) as HTMLInputElement;
      if (input) {
        mapService.attachAutocomplete(input, wp.id, (place) => {
          this.onPlaceSelected(wp.id, place);
        });
      }
    });
  }

  // --- Waypoint Management ---

  private createEmptyWaypoint(type: 'origin' | 'stop' | 'destination'): Waypoint {
    return {
      id: this.generateId(),
      label: '',
      placeId: '',
      lat: 0,
      lng: 0,
      type,
    };
  }

  private addStop(): void {
    // Insert before destination (last element)
    const newStop = this.createEmptyWaypoint('stop');
    this.waypoints.splice(this.waypoints.length - 1, 0, newStop);
    this.rerender();
  }

  private removeWaypoint(index: number): void {
    const wp = this.waypoints[index];
    if (wp.type === 'origin' || wp.type === 'destination') return;

    mapService.detachAutocomplete(wp.id);
    this.waypoints.splice(index, 1);
    this.rerender();

    // Recalculate if we have a route
    if (this.currentRouteId && this.hasMinimumWaypoints()) {
      this.calculateRoute();
    }
  }

  private moveWaypoint(index: number, direction: 'up' | 'down'): void {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Don't move past origin (index 0) or destination (last index)
    if (targetIndex <= 0 || targetIndex >= this.waypoints.length - 1) return;

    const temp = this.waypoints[index];
    this.waypoints[index] = this.waypoints[targetIndex];
    this.waypoints[targetIndex] = temp;

    this.rerender();

    // Recalculate if we have a route
    if (this.currentRouteId && this.hasMinimumWaypoints()) {
      this.calculateRoute();
    }
  }

  private onPlaceSelected(waypointId: string, place: google.maps.places.PlaceResult): void {
    const wp = this.waypoints.find((w) => w.id === waypointId);
    if (!wp || !place.geometry?.location) return;

    wp.label = place.formatted_address || place.name || '';
    wp.placeId = place.place_id || '';
    wp.lat = place.geometry.location.lat();
    wp.lng = place.geometry.location.lng();

    this.updateMapDisplay();
  }

  // --- Route Calculation ---

  private async calculateRoute(): Promise<void> {
    if (!this.hasMinimumWaypoints()) {
      this.showError('Please set at least an origin and destination.');
      return;
    }

    this.setLoading(true);
    this.alternatives = [];

    try {
      // Build waypoints payload
      const waypointsPayload = this.waypoints
        .filter((wp) => wp.lat !== 0 && wp.lng !== 0)
        .map((wp, index) => ({
          position: index,
          label: wp.label,
          latitude: wp.lat,
          longitude: wp.lng,
          placeId: wp.placeId,
          waypointType: wp.type,
        }));

      // Create or update route
      let routeId = this.currentRouteId;

      if (!routeId) {
        const createRes = await apiClient.post<{ id: string }>('/routes', {
          waypoints: waypointsPayload,
        });
        routeId = createRes.data.id;
        this.currentRouteId = routeId;
      } else {
        await apiClient.put(`/routes/${routeId}`, {
          waypoints: waypointsPayload,
        });
      }

      // Trigger calculation
      const calcRes = await apiClient.post<{
        totalDistanceKm: number;
        totalDurationSeconds: number;
        polylineEncoded: string;
        segments: RouteSegment[];
      }>(`/routes/${routeId}/calculate`);

      this.routeData = {
        id: routeId,
        totalDistanceKm: calcRes.data.totalDistanceKm,
        totalDurationSeconds: calcRes.data.totalDurationSeconds,
        polylineEncoded: calcRes.data.polylineEncoded,
        segments: calcRes.data.segments || [],
      };

      // Update map with route
      this.updateMapDisplay();
      if (this.routeData.polylineEncoded && this.mapInitialized) {
        mapService.drawRoute(this.routeData.polylineEncoded);
      }

      // Re-render to show route info
      this.rerender();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to calculate route. Please try again.';
      this.showError(message);
    } finally {
      this.setLoading(false);
    }
  }

  // --- Alternatives ---

  private async showAlternatives(): Promise<void> {
    if (!this.currentRouteId) return;

    this.setLoading(true);

    try {
      const res = await apiClient.get<{
        alternatives: AlternativeRoute[];
      }>(`/routes/${this.currentRouteId}/alternatives`);

      this.alternatives = res.data.alternatives || [];

      // Draw alternatives on map
      if (this.mapInitialized && this.alternatives.length > 0) {
        const polylines = this.alternatives.map((a) => a.polylineEncoded);
        mapService.drawAlternatives(polylines, (index) => {
          this.selectAlternative(index);
        });
      }

      this.rerender();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Failed to load alternatives.';
      this.showError(message);
    } finally {
      this.setLoading(false);
    }
  }

  private selectAlternative(index: number): void {
    const alt = this.alternatives[index];
    if (!alt) return;

    // Replace current route data with selected alternative
    this.routeData = {
      id: this.currentRouteId || '',
      totalDistanceKm: alt.totalDistanceKm,
      totalDurationSeconds: alt.totalDurationSeconds,
      polylineEncoded: alt.polylineEncoded,
      segments: [], // Segments will be fetched on next full calculation
    };

    // Redraw map
    if (this.mapInitialized) {
      mapService.clearAlternatives();
      mapService.drawRoute(alt.polylineEncoded);
    }

    this.alternatives = [];
    this.rerender();
  }

  // --- UI Helpers ---

  private setLoading(loading: boolean): void {
    this.isCalculating = loading;
    const overlay = this.container.querySelector('#map-loading');
    if (overlay) {
      overlay.classList.toggle('is-visible', loading);
    }
  }

  private showError(message: string): void {
    // Use a simple snackbar-style notification
    const existing = document.querySelector('.route-error-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'route-error-toast mdl-shadow--2dp';
    toast.innerHTML = `
      <i class="material-icons">error</i>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
  }

  private updateMapDisplay(): void {
    if (!this.mapInitialized) return;

    const validWaypoints = this.waypoints.filter((wp) => wp.lat !== 0 && wp.lng !== 0);
    if (validWaypoints.length > 0) {
      mapService.setMarkers(
        validWaypoints.map((wp) => ({
          lat: wp.lat,
          lng: wp.lng,
          label: wp.label,
        }))
      );
    }
  }

  private hasMinimumWaypoints(): boolean {
    const validWaypoints = this.waypoints.filter((wp) => wp.lat !== 0 && wp.lng !== 0);
    return validWaypoints.length >= 2;
  }

  private rerender(): void {
    // Detach all autocomplete instances before re-rendering
    this.waypoints.forEach((wp) => mapService.detachAutocomplete(wp.id));

    this.container.innerHTML = this.buildHTML();
    this.bindEvents();
    this.setupAutocomplete();
    this.upgradeComponents();

    // Re-init map if needed (the container was replaced)
    if (typeof window.google !== 'undefined' && window.google.maps) {
      const mapContainer = this.container.querySelector('#route-map') as HTMLElement;
      if (mapContainer) {
        mapService.initMap(mapContainer);
        this.mapInitialized = true;
        this.updateMapDisplay();
        if (this.routeData?.polylineEncoded) {
          mapService.drawRoute(this.routeData.polylineEncoded);
        }
      }
    }
  }

  private upgradeComponents(): void {
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
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

  private generateId(): string {
    return `wp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
