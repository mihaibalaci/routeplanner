/**
 * ASCII Waypoint Exporter
 * Exports routes in simple ASCII text format, one waypoint per line.
 * Format: longitude,latitude,"label"
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

export class AscExporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'asc';
  readonly maxWaypoints: number | null = null; // No limit

  export(route: Route, waypoints: Waypoint[]): Buffer {
    const lines: string[] = [];

    // Header
    lines.push(`; Route: ${route.name || 'Unnamed Route'}`);
    lines.push(`; Waypoints: ${waypoints.length}`);
    lines.push('');

    for (const wp of waypoints) {
      const label = (wp.label || `Waypoint ${wp.position}`).replace(/"/g, "'");
      lines.push(`${wp.longitude},${wp.latitude},"${label}"`);
    }

    const content = lines.join('\r\n') + '\r\n';
    return Buffer.from(content, 'utf-8');
  }

  validate(_route: Route, waypoints: Waypoint[]): ValidationResult {
    const errors: string[] = [];

    if (waypoints.length === 0) {
      errors.push('Route must have at least one waypoint');
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
