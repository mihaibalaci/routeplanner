/**
 * Garmin FIT Exporter
 * Exports routes in a simplified Garmin FIT (Flexible and Interoperable Data Transfer) binary format.
 *
 * This is a simplified implementation that produces a valid FIT file structure
 * with course points (waypoints). Full FIT protocol support would require
 * the complete FIT SDK, but this produces files that can be parsed for waypoint data.
 *
 * Simplified FIT structure:
 * - 14-byte file header
 * - Data records (course point messages)
 * - 2-byte CRC
 */

import { Route, Waypoint } from '../models/route';
import { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';

/** Convert WGS84 degrees to FIT semicircles */
function degreesToSemicircles(degrees: number): number {
  return Math.round((degrees / 180) * 0x7fffffff);
}

/** Calculate CRC-16 for FIT file */
function calculateCrc(data: Buffer): number {
  const crcTable = [
    0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800,
    0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
  ];

  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    // Low nibble
    let tmp = crcTable[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ crcTable[byte & 0xf];
    // High nibble
    tmp = crcTable[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ crcTable[(byte >> 4) & 0xf];
  }

  return crc;
}

export class FitExporter implements IRouteFormatExporter {
  readonly format: ExportFormat = 'fit';
  readonly maxWaypoints: number | null = null; // No practical limit

  export(_route: Route, waypoints: Waypoint[]): Buffer {
    // Build data records for each waypoint as course points
    const records: Buffer[] = [];

    // Definition message for course_point (message type 32)
    // Simplified: we store lat, lon for each point
    // Structure: header(1) + reserved(1) + arch(1) + globalMsgNum(2) + numFields(1) + fields(2*3=6) = 12
    const defMsg = Buffer.alloc(12);
    let offset = 0;
    defMsg.writeUInt8(0x40, offset); // Record header: definition message, local message 0
    offset += 1;
    defMsg.writeUInt8(0x00, offset); // Reserved
    offset += 1;
    defMsg.writeUInt8(0x00, offset); // Architecture: little-endian
    offset += 1;
    defMsg.writeUInt16LE(32, offset); // Global message number: course_point
    offset += 2;
    defMsg.writeUInt8(2, offset); // Number of fields: 2 (lat, lon)
    offset += 1;
    // Field 1: latitude (field def num 5, size 4, base type sint32)
    defMsg.writeUInt8(5, offset);
    offset += 1;
    defMsg.writeUInt8(4, offset);
    offset += 1;
    defMsg.writeUInt8(0x85, offset); // sint32
    offset += 1;
    // Field 2: longitude (field def num 6, size 4, base type sint32)
    defMsg.writeUInt8(6, offset);
    offset += 1;
    defMsg.writeUInt8(4, offset);
    offset += 1;
    defMsg.writeUInt8(0x85, offset); // sint32
    records.push(defMsg);

    // Data messages for each waypoint
    for (const wp of waypoints) {
      const dataMsg = Buffer.alloc(9);
      let dOffset = 0;
      dataMsg.writeUInt8(0x00, dOffset); // Record header: data message, local message 0
      dOffset += 1;
      dataMsg.writeInt32LE(degreesToSemicircles(wp.latitude), dOffset);
      dOffset += 4;
      dataMsg.writeInt32LE(degreesToSemicircles(wp.longitude), dOffset);
      records.push(dataMsg);
    }

    const dataContent = Buffer.concat(records);
    const dataSize = dataContent.length;

    // FIT file header (14 bytes)
    const header = Buffer.alloc(14);
    header.writeUInt8(14, 0); // Header size
    header.writeUInt8(20, 1); // Protocol version (2.0)
    header.writeUInt16LE(2100, 2); // Profile version (21.00)
    header.writeUInt32LE(dataSize, 4); // Data size
    header.write('.FIT', 8, 4, 'ascii'); // Data type
    const headerCrc = calculateCrc(header.subarray(0, 12));
    header.writeUInt16LE(headerCrc, 12);

    // Calculate file CRC
    const fileWithoutCrc = Buffer.concat([header, dataContent]);
    const fileCrc = calculateCrc(fileWithoutCrc);
    const crcBuf = Buffer.alloc(2);
    crcBuf.writeUInt16LE(fileCrc, 0);

    return Buffer.concat([fileWithoutCrc, crcBuf]);
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
