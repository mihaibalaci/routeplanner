/**
 * Google Maps Service
 *
 * Wraps the Google Maps JavaScript SDK for:
 * - Map initialization (centered on Europe)
 * - Marker management for waypoints
 * - Route polyline rendering
 * - Places Autocomplete for waypoint inputs
 * - Alternative route display
 */

declare global {
  interface Window {
    google: typeof google;
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  polyline: string; // encoded polyline
  distanceKm: number;
  durationSeconds: number;
  segments: SegmentResult[];
}

export interface SegmentResult {
  startLabel: string;
  endLabel: string;
  distanceKm: number;
  durationSeconds: number;
}

// Europe center (roughly)
const EUROPE_CENTER: LatLng = { lat: 48.5, lng: 10.0 };
const DEFAULT_ZOOM = 5;

class MapService {
  private map: google.maps.Map | null = null;
  private markers: google.maps.Marker[] = [];
  private routePolyline: google.maps.Polyline | null = null;
  private alternativePolylines: google.maps.Polyline[] = [];
  private autocompleteInstances: Map<string, google.maps.places.Autocomplete> = new Map();

  /**
   * Initialize the Google Map in the given container element.
   */
  initMap(container: HTMLElement): google.maps.Map {
    this.map = new google.maps.Map(container, {
      center: EUROPE_CENTER,
      zoom: DEFAULT_ZOOM,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });
    return this.map;
  }

  getMap(): google.maps.Map | null {
    return this.map;
  }

  /**
   * Set markers for the given waypoints. Clears existing markers first.
   */
  setMarkers(waypoints: { lat: number; lng: number; label: string }[]): void {
    this.clearMarkers();

    if (!this.map) return;

    waypoints.forEach((wp, index) => {
      const marker = new google.maps.Marker({
        position: { lat: wp.lat, lng: wp.lng },
        map: this.map!,
        label: {
          text: index === 0 ? 'A' : index === waypoints.length - 1 ? 'B' : `${index}`,
          color: '#fff',
          fontWeight: 'bold',
        },
        title: wp.label,
      });
      this.markers.push(marker);
    });

    // Fit bounds to show all markers
    if (waypoints.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      waypoints.forEach((wp) => bounds.extend({ lat: wp.lat, lng: wp.lng }));
      this.map.fitBounds(bounds, 50);
    } else if (waypoints.length === 1) {
      this.map.setCenter({ lat: waypoints[0].lat, lng: waypoints[0].lng });
      this.map.setZoom(12);
    }
  }

  /**
   * Draw the main route polyline on the map using an encoded polyline string.
   */
  drawRoute(encodedPolyline: string): void {
    this.clearRoute();

    if (!this.map || !encodedPolyline) return;

    const path = google.maps.geometry.encoding.decodePath(encodedPolyline);

    this.routePolyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#3f51b5',
      strokeOpacity: 1.0,
      strokeWeight: 4,
      map: this.map,
    });
  }

  /**
   * Draw alternative routes with a lighter style.
   */
  drawAlternatives(encodedPolylines: string[], onSelect: (index: number) => void): void {
    this.clearAlternatives();

    if (!this.map) return;

    encodedPolylines.forEach((encoded, index) => {
      const path = google.maps.geometry.encoding.decodePath(encoded);
      const polyline = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#9e9e9e',
        strokeOpacity: 0.7,
        strokeWeight: 3,
        map: this.map!,
      });

      polyline.addListener('click', () => {
        onSelect(index);
      });

      this.alternativePolylines.push(polyline);
    });
  }

  /**
   * Attach Places Autocomplete to an input element.
   * Restricted to European countries.
   */
  attachAutocomplete(
    inputElement: HTMLInputElement,
    inputId: string,
    onPlaceSelected: (place: google.maps.places.PlaceResult) => void
  ): void {
    // Remove existing autocomplete for this input if any
    this.detachAutocomplete(inputId);

    const autocomplete = new google.maps.places.Autocomplete(inputElement, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: this.getEuropeanCountryCodes() },
      fields: ['place_id', 'geometry', 'formatted_address', 'name'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place && place.geometry) {
        onPlaceSelected(place);
      }
    });

    this.autocompleteInstances.set(inputId, autocomplete);
  }

  /**
   * Detach autocomplete from an input.
   */
  detachAutocomplete(inputId: string): void {
    const existing = this.autocompleteInstances.get(inputId);
    if (existing) {
      google.maps.event.clearInstanceListeners(existing);
      this.autocompleteInstances.delete(inputId);
    }
  }

  /**
   * Clear all markers from the map.
   */
  clearMarkers(): void {
    this.markers.forEach((m) => m.setMap(null));
    this.markers = [];
  }

  /**
   * Clear the main route polyline.
   */
  clearRoute(): void {
    if (this.routePolyline) {
      this.routePolyline.setMap(null);
      this.routePolyline = null;
    }
  }

  /**
   * Clear alternative route polylines.
   */
  clearAlternatives(): void {
    this.alternativePolylines.forEach((p) => p.setMap(null));
    this.alternativePolylines = [];
  }

  /**
   * Clear everything from the map.
   */
  clearAll(): void {
    this.clearMarkers();
    this.clearRoute();
    this.clearAlternatives();
  }

  /**
   * European country codes for Places Autocomplete restriction.
   */
  private getEuropeanCountryCodes(): string[] {
    return [
      'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr',
      'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl',
      'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch', 'no', 'gb',
      'rs', 'ba', 'me', 'mk', 'al', 'md', 'ua',
    ];
  }
}

// Export singleton
export const mapService = new MapService();
