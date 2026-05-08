/**
 * Google Maps Service — Minimal integration
 *
 * Follows the official "Get Started" guide:
 * https://developers.google.com/maps/get-started/
 *
 * Loads the Maps JavaScript API dynamically when needed.
 * Provides map rendering and route display.
 */

let mapsLoaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Load the Google Maps JavaScript API dynamically.
 * Only loads once; subsequent calls return immediately.
 */
export function loadGoogleMaps(): Promise<void> {
  if (mapsLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const apiKey = (window as any).__GOOGLE_MAPS_API_KEY || '';
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key not configured'));
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=__gmapsReady`;
    script.async = true;
    script.defer = true;

    (window as any).__gmapsReady = () => {
      mapsLoaded = true;
      resolve();
    };

    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Check if Google Maps is available.
 */
export function isMapsAvailable(): boolean {
  return mapsLoaded && typeof (window as any).google?.maps !== 'undefined';
}

/**
 * Initialize a map in the given container.
 */
export function createMap(container: HTMLElement, options?: { center?: { lat: number; lng: number }; zoom?: number }): any {
  if (!isMapsAvailable()) return null;
  const google = (window as any).google;
  return new google.maps.Map(container, {
    center: options?.center || { lat: 48.5, lng: 10.0 }, // Europe center
    zoom: options?.zoom || 5,
    mapTypeControl: true,
    streetViewControl: false,
  });
}

/**
 * Display a route on the map using DirectionsRenderer.
 */
export function displayRoute(
  map: any,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints?: Array<{ lat: number; lng: number }>
): Promise<any> {
  if (!isMapsAvailable()) return Promise.reject(new Error('Maps not loaded'));
  const google = (window as any).google;

  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({ map });

  const request: any = {
    origin,
    destination,
    travelMode: google.maps.TravelMode.DRIVING,
  };

  if (waypoints?.length) {
    request.waypoints = waypoints.map(wp => ({ location: wp, stopover: true }));
  }

  return new Promise((resolve, reject) => {
    directionsService.route(request, (result: any, status: any) => {
      if (status === 'OK') {
        directionsRenderer.setDirections(result);
        resolve(result);
      } else {
        reject(new Error(`Directions request failed: ${status}`));
      }
    });
  });
}
