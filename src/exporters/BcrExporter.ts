/**
 * Map&Guide BCR Exporter
 * Exports routes in BCR (Binary Coded Route) format.
 * INI-style text format, max 99 waypoints.
 *
 * Format:
 * [client]
 * request=route
 * [route]
 * routecount=N
 * [coordinates]
 * 0=longitude_mercator,latitude_mercator,label
 * ...
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

/**
 * Convert WGS84 latitude/longitude to Mercator coordinates used by BCR format.
 * BCR uses a simplified Mercator projection scaled to integer values.
 */
function toMercatorX(longitude: number): number {
  return Math.round(((longitude + 180) / 360) * 2000000000);
}

function toMercatorY(latitude: number): number {
  const latRad = (latitude * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return Math.round(((mercN / Math.PI + 1) / 2) * 2000000000);
}

export class BcrExporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'bcr';
  readonly maxWaypoints: number = 99;

  export(_route: Route, waypoints: Waypoint[]): Buffer {
    const lines: string[] = [];

    // Client section
    lines.push('[client]');
    lines.push('request=route');
    lines.push('');

    // Route section
    lines.push('[route]');
    lines.push(`routecount=${waypoints.length}`);
    lines.push('');

    // Coordinates section
    lines.push('[coordinates]');
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const x = toMercatorX(wp.longitude);
      const y = toMercatorY(wp.latitude);
      const label = (wp.label || `Waypoint ${wp.position}`).replace(/,/g, ' ');
      lines.push(`${i}=${x},${y},${label}`);
    }

    const content = lines.join('\r\n') + '\r\n';
    return Buffer.from(content, 'utf-8');
  }

  validate(_route: Route, waypoints: Waypoint[]): ValidationResult {
    const errors: string[] = [];

    if (waypoints.length === 0) {
      errors.push('Route must have at least one waypoint');
    }

    if (waypoints.length > this.maxWaypoints) {
      errors.push(
        `BCR format supports maximum ${this.maxWaypoints} waypoints, route has ${waypoints.length}`
      );
    }

    for (const wp of waypoints) {
      if (wp.latitude < -90 || wp.latitude > 90) {
        errors.push(`Waypoint "${wp.label || wp.position}" has invalid latitude: ${wp.latitude}`);
      }
      if (wp.longitude < -180 || wp.longitude > 180) {
        errors.push(`Waypoint "${wp.label || wp.position}" has invalid longitude: ${wp.longitude}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
