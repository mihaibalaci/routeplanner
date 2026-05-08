/**
 * TomTom ITN Exporter
 * Exports routes in TomTom ITN (Itinerary) format.
 * Format: pipe-delimited text, max 48 waypoints.
 * Each line: longitude*100000|latitude*100000|label|waypoint_type_code
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

export class ItnExporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'itn';
  readonly maxWaypoints: number = 48;

  export(_route: Route, waypoints: Waypoint[]): Buffer {
    const lines = waypoints.map((wp) => {
      const lon = Math.round(wp.longitude * 100000);
      const lat = Math.round(wp.latitude * 100000);
      const label = (wp.label || `Waypoint ${wp.position}`).replace(/\|/g, ' ');
      // ITN type codes: 0 = intermediate, 1 = departure, 2 = destination, 4 = waypoint
      let typeCode = 4; // default waypoint
      if (wp.waypoint_type === 'origin') typeCode = 1;
      else if (wp.waypoint_type === 'destination') typeCode = 2;
      else typeCode = 3; // stop/via point

      return `${lon}|${lat}|${label}|${typeCode}`;
    });

    const content = lines.join('\n') + '\n';
    return Buffer.from(content, 'utf-8');
  }

  validate(_route: Route, waypoints: Waypoint[]): ValidationResult {
    const errors: string[] = [];

    if (waypoints.length === 0) {
      errors.push('Route must have at least one waypoint');
    }

    if (waypoints.length > this.maxWaypoints) {
      errors.push(
        `ITN format supports maximum ${this.maxWaypoints} waypoints, route has ${waypoints.length}`
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
