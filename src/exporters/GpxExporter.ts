/**
 * GPX 1.1 Exporter
 * Exports routes in GPX (GPS Exchange Format) 1.1 with waypoints and track segments.
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class GpxExporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'gpx';
  readonly maxWaypoints: number | null = null; // GPX has no waypoint limit

  export(route: Route, waypoints: Waypoint[]): Buffer {
    const routeName = route.name || 'Unnamed Route';

    const wptElements = waypoints
      .map(
        (wp) => `  <wpt lat="${wp.latitude}" lon="${wp.longitude}">
    <name>${escapeXml(wp.label || `Waypoint ${wp.position}`)}</name>
    <type>${escapeXml(wp.waypoint_type)}</type>
  </wpt>`
      )
      .join('\n');

    const trkptElements = waypoints
      .map(
        (wp) =>
          `      <trkpt lat="${wp.latitude}" lon="${wp.longitude}">
        <name>${escapeXml(wp.label || `Waypoint ${wp.position}`)}</name>
      </trkpt>`
      )
      .join('\n');

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RoutePlanner"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(routeName)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wptElements}
  <trk>
    <name>${escapeXml(routeName)}</name>
    <trkseg>
${trkptElements}
    </trkseg>
  </trk>
</gpx>`;

    return Buffer.from(gpx, 'utf-8');
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
