/**
 * Map&Guide MPS Exporter
 * Exports routes in Map&Guide MPS (Map&Guide Professional Server) text format.
 * Max 20 waypoints.
 *
 * Format:
 * [ROUTE]
 * Stations=N
 * [STATION0]
 * Name=label
 * Longitude=lon_degrees
 * Latitude=lat_degrees
 * ...
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

export class MpsExporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'mps';
  readonly maxWaypoints: number = 20;

  export(route: Route, waypoints: Waypoint[]): Buffer {
    const lines: string[] = [];

    // Route header
    lines.push('[ROUTE]');
    lines.push(`Name=${route.name || 'Unnamed Route'}`);
    lines.push(`Stations=${waypoints.length}`);
    lines.push('');

    // Station entries
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const label = wp.label || `Waypoint ${wp.position}`;

      lines.push(`[STATION${i}]`);
      lines.push(`Name=${label}`);
      lines.push(`Longitude=${wp.longitude.toFixed(6)}`);
      lines.push(`Latitude=${wp.latitude.toFixed(6)}`);

      // Station type
      if (wp.waypoint_type === 'origin') {
        lines.push('Type=Start');
      } else if (wp.waypoint_type === 'destination') {
        lines.push('Type=End');
      } else {
        lines.push('Type=Via');
      }

      lines.push('');
    }

    const content = lines.join('\r\n');
    return Buffer.from(content, 'utf-8');
  }

  validate(_route: Route, waypoints: Waypoint[]): ValidationResult {
    const errors: string[] = [];

    if (waypoints.length === 0) {
      errors.push('Route must have at least one waypoint');
    }

    if (waypoints.length > this.maxWaypoints) {
      errors.push(
        `MPS format supports maximum ${this.maxWaypoints} waypoints, route has ${waypoints.length}`
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
