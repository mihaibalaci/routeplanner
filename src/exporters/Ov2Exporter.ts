/**
 * TomTom OV2 POI Exporter
 * Exports routes in TomTom OV2 binary POI format.
 * Max 255 waypoints.
 *
 * OV2 record format (type 2 - simple POI):
 * - 1 byte: record type (0x02)
 * - 4 bytes: total record length (little-endian int32)
 * - 4 bytes: longitude * 100000 (little-endian int32)
 * - 4 bytes: latitude * 100000 (little-endian int32)
 * - N bytes: label (null-terminated ASCII string)
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

export class Ov2Exporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'ov2';
  readonly maxWaypoints: number = 255;

  export(_route: Route, waypoints: Waypoint[]): Buffer {
    const records: Buffer[] = [];

    for (const wp of waypoints) {
      const label = (wp.label || `Waypoint ${wp.position}`).replace(/[^\x20-\x7E]/g, '?');
      const labelBytes = Buffer.from(label + '\0', 'ascii');

      // Record: type(1) + length(4) + lon(4) + lat(4) + label(N)
      const recordLength = 1 + 4 + 4 + 4 + labelBytes.length;
      const record = Buffer.alloc(recordLength);

      let offset = 0;
      record.writeUInt8(0x02, offset); // Type 2: simple POI
      offset += 1;
      record.writeInt32LE(recordLength, offset);
      offset += 4;
      record.writeInt32LE(Math.round(wp.longitude * 100000), offset);
      offset += 4;
      record.writeInt32LE(Math.round(wp.latitude * 100000), offset);
      offset += 4;
      labelBytes.copy(record, offset);

      records.push(record);
    }

    return Buffer.concat(records);
  }

  validate(_route: Route, waypoints: Waypoint[]): ValidationResult {
    const errors: string[] = [];

    if (waypoints.length === 0) {
      errors.push('Route must have at least one waypoint');
    }

    if (waypoints.length > this.maxWaypoints) {
      errors.push(
        `OV2 format supports maximum ${this.maxWaypoints} waypoints, route has ${waypoints.length}`
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
