/**
 * ChargingStationLayer — Map overlay for EV charging stations.
 *
 * Displays charging station markers on the Google Maps instance when an EV
 * vehicle is selected and a route is displayed. Attempts to fetch station data
 * from the backend API first; on failure, embeds a ChargeMap iframe widget as
 * a graceful fallback.
 *
 * Requirements: 8.1, 8.3, 8.4, 8.6
 */

import { apiClient } from '../api/client';

export interface ChargingStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  connectorTypes: string[];
  availability?: 'available' | 'occupied' | 'unknown';
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ChargingStationLayerOptions {
  map: google.maps.Map;
}

export class ChargingStationLayer {
  private map: google.maps.Map;
  private markers: google.maps.Marker[] = [];
  private infoWindow: google.maps.InfoWindow | null = null;
  private iframeContainer: HTMLElement | null = null;

  constructor(options: ChargingStationLayerOptions) {
    this.map = options.map;
  }

  /**
   * Show charging stations within the given route bounds.
   * Fetches from the backend API; on failure, embeds ChargeMap iframe widget.
   */
  async show(routeBounds: google.maps.LatLngBounds): Promise<void> {
    this.hide();

    const bbox = this.boundsToBoundingBox(routeBounds);

    try {
      const stations = await this.fetchStations(bbox);

      if (stations.length === 0) {
        this.showEmptyMessage();
        return;
      }

      this.createMarkers(stations);
    } catch {
      this.showIframeFallback(bbox);
    }
  }

  /**
   * Hide all markers and remove any iframe fallback from the map.
   */
  hide(): void {
    this.clearMarkers();
    this.removeIframe();
    this.closeInfoWindow();
  }

  /**
   * Clean up all resources held by this layer.
   */
  destroy(): void {
    this.hide();
    this.infoWindow = null;
  }

  // --- Private Methods ---

  private boundsToBoundingBox(bounds: google.maps.LatLngBounds): BoundingBox {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    return {
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
    };
  }

  private async fetchStations(bbox: BoundingBox): Promise<ChargingStation[]> {
    const params: Record<string, string> = {
      north: String(bbox.north),
      south: String(bbox.south),
      east: String(bbox.east),
      west: String(bbox.west),
    };

    const response = await apiClient.get<ChargingStation[]>('/charging-stations', params);
    return response.data;
  }

  private createMarkers(stations: ChargingStation[]): void {
    for (const station of stations) {
      const marker = new google.maps.Marker({
        position: { lat: station.latitude, lng: station.longitude },
        map: this.map,
        title: station.name,
        icon: {
          url: 'data:image/svg+xml,' + encodeURIComponent(this.getMarkerSvg()),
          scaledSize: new google.maps.Size(32, 32),
        },
      });

      marker.addListener('click', () => {
        this.showInfoWindow(marker, station);
      });

      this.markers.push(marker);
    }
  }

  private showInfoWindow(marker: google.maps.Marker, station: ChargingStation): void {
    this.closeInfoWindow();

    const content = this.buildInfoWindowContent(station);

    this.infoWindow = new google.maps.InfoWindow({ content });
    this.infoWindow.open(this.map, marker);
  }

  private buildInfoWindowContent(station: ChargingStation): string {
    const connectors = station.connectorTypes.length > 0
      ? station.connectorTypes.join(', ')
      : 'Unknown';

    const availabilityLabel = this.formatAvailability(station.availability);

    return `
      <div class="charging-station-info" style="padding: 8px; max-width: 250px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px;">${this.escapeHtml(station.name)}</h4>
        <p style="margin: 0 0 4px 0; font-size: 12px;">
          <strong>Connectors:</strong> ${this.escapeHtml(connectors)}
        </p>
        <p style="margin: 0; font-size: 12px;">
          <strong>Availability:</strong> ${availabilityLabel}
        </p>
      </div>
    `;
  }

  private formatAvailability(availability?: 'available' | 'occupied' | 'unknown'): string {
    switch (availability) {
      case 'available':
        return '<span style="color: #16a34a;">Available</span>';
      case 'occupied':
        return '<span style="color: #dc2626;">Occupied</span>';
      case 'unknown':
      default:
        return '<span style="color: #6b7280;">Unknown</span>';
    }
  }

  private showEmptyMessage(): void {
    this.closeInfoWindow();

    const center = this.map.getCenter();
    if (!center) return;

    this.infoWindow = new google.maps.InfoWindow({
      content: '<div style="padding: 8px; font-size: 13px;">No charging stations found along this route.</div>',
      position: center,
    });
    this.infoWindow.open(this.map);
  }

  private showIframeFallback(bbox: BoundingBox): void {
    this.removeIframe();

    const mapDiv = this.map.getDiv();
    if (!mapDiv) return;

    this.iframeContainer = document.createElement('div');
    this.iframeContainer.className = 'charging-station-iframe-container';
    this.iframeContainer.style.cssText =
      'position: absolute; top: 10px; right: 10px; width: 350px; height: 400px; ' +
      'z-index: 1000; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); ' +
      'overflow: hidden; display: flex; flex-direction: column;';

    const header = document.createElement('div');
    header.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; ' +
      'padding: 8px 12px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb;';
    header.innerHTML = '<span style="font-size: 13px; font-weight: 600;">Charging Stations (ChargeMap)</span>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText =
      'border: none; background: none; cursor: pointer; font-size: 16px; color: #6b7280; padding: 0 4px;';
    closeBtn.setAttribute('aria-label', 'Close charging stations panel');
    closeBtn.addEventListener('click', () => this.removeIframe());
    header.appendChild(closeBtn);

    const centerLat = (bbox.north + bbox.south) / 2;
    const centerLng = (bbox.east + bbox.west) / 2;

    const iframe = document.createElement('iframe');
    iframe.src = `https://chargemap.com/map?lat=${centerLat}&lng=${centerLng}&zoom=10`;
    iframe.style.cssText = 'flex: 1; border: none; width: 100%;';
    iframe.title = 'ChargeMap charging stations';
    iframe.setAttribute('loading', 'lazy');

    this.iframeContainer.appendChild(header);
    this.iframeContainer.appendChild(iframe);

    mapDiv.style.position = 'relative';
    mapDiv.appendChild(this.iframeContainer);
  }

  private clearMarkers(): void {
    for (const marker of this.markers) {
      marker.setMap(null);
    }
    this.markers = [];
  }

  private removeIframe(): void {
    if (this.iframeContainer) {
      this.iframeContainer.remove();
      this.iframeContainer = null;
    }
  }

  private closeInfoWindow(): void {
    if (this.infoWindow) {
      this.infoWindow.close();
      this.infoWindow = null;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getMarkerSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <circle cx="16" cy="16" r="14" fill="#16a34a" stroke="#fff" stroke-width="2"/>
      <text x="16" y="21" text-anchor="middle" font-size="14" fill="white">⚡</text>
    </svg>`;
  }
}
