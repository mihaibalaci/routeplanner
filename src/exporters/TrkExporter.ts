/**
 * CompeGPS TRK Exporter
 * Exports routes in CompeGPS TRK (Track) text format.
 *
 * Format:
 * G  WGS 84
 * U  1
 * C  255 0 0 2 -1.000000
 * s  ...
 * T  A latitude longitude date time s altitude
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

export class TrkExporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'trk';
  readonly maxWaypoints: number | null = null; // No limit

  export(route: Route, waypoints: Waypoint[]): Buffer {
    const lines: string[] = [];

    // Header
    lines.push('G  WGS 84');
    lines.push('U  1');
    lines.push('C  255 0 0 2 -1.000000');
    lines.push(`s  ${route.name || 'Unnamed Route'}`);

    // Track points
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}-${getMonthAbbr(now.getMonth())}-${String(now.getFullYear()).slice(2)}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    for (const wp of waypoints) {
      // T  A latitude longitude date time s altitude
      const lat = wp.latitude.toFixed(7);
      const lon = wp.longitude.toFixed(7);
      lines.push(`T  A ${lat}\u00ba ${lon}\u00ba ${dateStr} ${timeStr} s 0.000000`);
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

function getMonthAbbr(month: number): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return months[month];
}
