/**
 * Map Service — Placeholder
 * Google Maps integration will be loaded dynamically when API key is configured.
 */
export const mapService = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'google' in window && !!(window as any).google?.maps;
  },
};
