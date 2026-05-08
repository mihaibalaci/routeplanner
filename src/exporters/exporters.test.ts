import { describe, it, expect } from 'vitest';
import { Route, Waypoint } from '../models/route';
import { GpxExporter } from './GpxExporter';
import { ItnExporter } from './ItnExporter';
import { AscExporter } from './AscExporter';
import { Ov2Exporter } from './Ov2Exporter';
import { BcrExporter } from './BcrExporter';
import { TrkExporter } from './TrkExporter';
import { MpsExporter } from './MpsExporter';
import { FitExporter } from './FitExporter';
import { getExporter, isFormatSupported, SUPPORTED_FORMATS, getAllExporters } from './index';

// Test fixtures
function createRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1',
    user_id: 'user-1',
    name: 'Test Route',
    total_distance_km: 500,
    total_duration_seconds: 18000,
    polyline_encoded: null,
    status: 'finalized',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

function createWaypoints(count: number = 3): Waypoint[] {
  const waypoints: Waypoint[] = [];
  for (let i = 0; i < count; i++) {
    let waypointType: 'origin' | 'stop' | 'destination' = 'stop';
    if (i === 0) waypointType = 'origin';
    else if (i === count - 1) waypointType = 'destination';

    waypoints.push({
      id: `wp-${i}`,
      route_id: 'route-1',
      position: i,
      label: `City ${i}`,
      latitude: 48.0 + i * 0.5,
      longitude: 11.0 + i * 0.3,
      place_id: `place-${i}`,
      formatted_address: `Address ${i}`,
      waypoint_type: waypointType,
    });
  }
  return waypoints;
}

describe('GpxExporter', () => {
  const exporter = new GpxExporter();

  it('should have correct format and no waypoint limit', () => {
    expect(exporter.format).toBe('gpx');
    expect(exporter.maxWaypoints).toBeNull();
  });

  it('should export valid GPX 1.1 XML', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);
    const buffer = exporter.export(route, waypoints);
    const xml = buffer.toString('utf-8');

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<gpx version="1.1"');
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml).toContain('<metadata>');
    expect(xml).toContain('<name>Test Route</name>');
  });

  it('should include all waypoints as wpt elements', () => {
    const route = createRoute();
    const waypoints = createWaypoints(4);
    const buffer = exporter.export(route, waypoints);
    const xml = buffer.toString('utf-8');

    for (const wp of waypoints) {
      expect(xml).toContain(`lat="${wp.latitude}"`);
      expect(xml).toContain(`lon="${wp.longitude}"`);
      expect(xml).toContain(`<name>${wp.label}</name>`);
    }

    // Count wpt elements
    const wptCount = (xml.match(/<wpt /g) || []).length;
    expect(wptCount).toBe(4);
  });

  it('should include track segment with all waypoints as trkpt', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);
    const buffer = exporter.export(route, waypoints);
    const xml = buffer.toString('utf-8');

    expect(xml).toContain('<trk>');
    expect(xml).toContain('<trkseg>');

    const trkptCount = (xml.match(/<trkpt /g) || []).length;
    expect(trkptCount).toBe(3);
  });

  it('should escape XML special characters in labels', () => {
    const route = createRoute({ name: 'Route <A> & "B"' });
    const waypoints: Waypoint[] = [
      {
        id: 'wp-1',
        route_id: 'route-1',
        position: 0,
        label: 'City <A> & "B"',
        latitude: 48.0,
        longitude: 11.0,
        place_id: null,
        formatted_address: null,
        waypoint_type: 'origin',
      },
    ];

    const buffer = exporter.export(route, waypoints);
    const xml = buffer.toString('utf-8');

    expect(xml).toContain('Route &lt;A&gt; &amp; &quot;B&quot;');
    expect(xml).toContain('City &lt;A&gt; &amp; &quot;B&quot;');
    expect(xml).not.toContain('<A>');
  });

  it('should handle waypoints without labels', () => {
    const route = createRoute();
    const waypoints: Waypoint[] = [
      {
        id: 'wp-1',
        route_id: 'route-1',
        position: 0,
        label: null,
        latitude: 48.0,
        longitude: 11.0,
        place_id: null,
        formatted_address: null,
        waypoint_type: 'origin',
      },
    ];

    const buffer = exporter.export(route, waypoints);
    const xml = buffer.toString('utf-8');

    expect(xml).toContain('<name>Waypoint 0</name>');
  });

  it('should validate waypoints with valid coordinates', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);
    const result = exporter.validate(route, waypoints);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty waypoints', () => {
    const route = createRoute();
    const result = exporter.validate(route, []);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Route must have at least one waypoint');
  });

  it('should reject invalid latitude', () => {
    const route = createRoute();
    const waypoints: Waypoint[] = [
      {
        id: 'wp-1',
        route_id: 'route-1',
        position: 0,
        label: 'Bad Point',
        latitude: 91,
        longitude: 11.0,
        place_id: null,
        formatted_address: null,
        waypoint_type: 'origin',
      },
    ];

    const result = exporter.validate(route, waypoints);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('invalid latitude');
  });

  it('should reject invalid longitude', () => {
    const route = createRoute();
    const waypoints: Waypoint[] = [
      {
        id: 'wp-1',
        route_id: 'route-1',
        position: 0,
        label: 'Bad Point',
        latitude: 48.0,
        longitude: 181,
        place_id: null,
        formatted_address: null,
        waypoint_type: 'origin',
      },
    ];

    const result = exporter.validate(route, waypoints);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('invalid longitude');
  });

  it('should produce a Buffer output', () => {
    const route = createRoute();
    const waypoints = createWaypoints(2);
    const result = exporter.export(route, waypoints);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('ItnExporter', () => {
  const exporter = new ItnExporter();

  it('should have correct format and max 48 waypoints', () => {
    expect(exporter.format).toBe('itn');
    expect(exporter.maxWaypoints).toBe(48);
  });

  it('should export pipe-delimited format', () => {
    const route = createRoute();
    const waypoints = createWaypoints(2);
    const buffer = exporter.export(route, waypoints);
    const content = buffer.toString('utf-8');

    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);

    for (const line of lines) {
      const parts = line.split('|');
      expect(parts.length).toBe(4);
    }
  });

  it('should encode coordinates as integer * 100000', () => {
    const route = createRoute();
    const waypoints: Waypoint[] = [
      {
        id: 'wp-1',
        route_id: 'route-1',
        position: 0,
        label: 'Munich',
        latitude: 48.13743,
        longitude: 11.57549,
        place_id: null,
        formatted_address: null,
        waypoint_type: 'origin',
      },
    ];

    const buffer = exporter.export(route, waypoints);
    const content = buffer.toString('utf-8');
    const parts = content.trim().split('|');

    expect(parts[0]).toBe('1157549'); // lon * 100000
    expect(parts[1]).toBe('4813743'); // lat * 100000
  });

  it('should reject routes exceeding 48 waypoints', () => {
    const route = createRoute();
    const waypoints = createWaypoints(49);
    const result = exporter.validate(route, waypoints);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('maximum 48 waypoints');
  });
});

describe('AscExporter', () => {
  const exporter = new AscExporter();

  it('should have correct format and no limit', () => {
    expect(exporter.format).toBe('asc');
    expect(exporter.maxWaypoints).toBeNull();
  });

  it('should export one waypoint per line with header', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);
    const buffer = exporter.export(route, waypoints);
    const content = buffer.toString('utf-8');

    expect(content).toContain('; Route: Test Route');
    expect(content).toContain('; Waypoints: 3');

    // Check waypoint lines
    for (const wp of waypoints) {
      expect(content).toContain(`${wp.longitude},${wp.latitude},"${wp.label}"`);
    }
  });
});

describe('Ov2Exporter', () => {
  const exporter = new Ov2Exporter();

  it('should have correct format and max 255 waypoints', () => {
    expect(exporter.format).toBe('ov2');
    expect(exporter.maxWaypoints).toBe(255);
  });

  it('should export binary format with correct record structure', () => {
    const route = createRoute();
    const waypoints: Waypoint[] = [
      {
        id: 'wp-1',
        route_id: 'route-1',
        position: 0,
        label: 'Test',
        latitude: 48.0,
        longitude: 11.0,
        place_id: null,
        formatted_address: null,
        waypoint_type: 'origin',
      },
    ];

    const buffer = exporter.export(route, waypoints);

    // First byte should be record type 0x02
    expect(buffer[0]).toBe(0x02);

    // Read longitude and latitude
    const lon = buffer.readInt32LE(5);
    const lat = buffer.readInt32LE(9);
    expect(lon).toBe(1100000); // 11.0 * 100000
    expect(lat).toBe(4800000); // 48.0 * 100000
  });

  it('should reject routes exceeding 255 waypoints', () => {
    const route = createRoute();
    const waypoints = createWaypoints(256);
    const result = exporter.validate(route, waypoints);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('maximum 255 waypoints');
  });
});

describe('BcrExporter', () => {
  const exporter = new BcrExporter();

  it('should have correct format and max 99 waypoints', () => {
    expect(exporter.format).toBe('bcr');
    expect(exporter.maxWaypoints).toBe(99);
  });

  it('should export INI-style format', () => {
    const route = createRoute();
    const waypoints = createWaypoints(2);
    const buffer = exporter.export(route, waypoints);
    const content = buffer.toString('utf-8');

    expect(content).toContain('[client]');
    expect(content).toContain('request=route');
    expect(content).toContain('[route]');
    expect(content).toContain('routecount=2');
    expect(content).toContain('[coordinates]');
    expect(content).toContain('0=');
    expect(content).toContain('1=');
  });
});

describe('TrkExporter', () => {
  const exporter = new TrkExporter();

  it('should have correct format and no limit', () => {
    expect(exporter.format).toBe('trk');
    expect(exporter.maxWaypoints).toBeNull();
  });

  it('should export CompeGPS TRK format with header', () => {
    const route = createRoute();
    const waypoints = createWaypoints(2);
    const buffer = exporter.export(route, waypoints);
    const content = buffer.toString('utf-8');

    expect(content).toContain('G  WGS 84');
    expect(content).toContain('U  1');
    expect(content).toContain('C  255 0 0 2 -1.000000');
    expect(content).toContain('s  Test Route');
    expect(content).toContain('T  A');
  });
});

describe('MpsExporter', () => {
  const exporter = new MpsExporter();

  it('should have correct format and max 20 waypoints', () => {
    expect(exporter.format).toBe('mps');
    expect(exporter.maxWaypoints).toBe(20);
  });

  it('should export INI-style station format', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);
    const buffer = exporter.export(route, waypoints);
    const content = buffer.toString('utf-8');

    expect(content).toContain('[ROUTE]');
    expect(content).toContain('Name=Test Route');
    expect(content).toContain('Stations=3');
    expect(content).toContain('[STATION0]');
    expect(content).toContain('[STATION1]');
    expect(content).toContain('[STATION2]');
    expect(content).toContain('Type=Start');
    expect(content).toContain('Type=Via');
    expect(content).toContain('Type=End');
  });

  it('should reject routes exceeding 20 waypoints', () => {
    const route = createRoute();
    const waypoints = createWaypoints(21);
    const result = exporter.validate(route, waypoints);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('maximum 20 waypoints');
  });
});

describe('FitExporter', () => {
  const exporter = new FitExporter();

  it('should have correct format and no limit', () => {
    expect(exporter.format).toBe('fit');
    expect(exporter.maxWaypoints).toBeNull();
  });

  it('should export binary FIT format with valid header', () => {
    const route = createRoute();
    const waypoints = createWaypoints(2);
    const buffer = exporter.export(route, waypoints);

    // Check FIT header
    expect(buffer[0]).toBe(14); // Header size
    expect(buffer.toString('ascii', 8, 12)).toBe('.FIT');
  });

  it('should produce a non-empty buffer', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);
    const buffer = exporter.export(route, waypoints);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(14); // At least header + some data
  });
});

describe('Exporter Registry', () => {
  it('should support all 8 formats', () => {
    expect(SUPPORTED_FORMATS).toHaveLength(8);
    expect(SUPPORTED_FORMATS).toContain('gpx');
    expect(SUPPORTED_FORMATS).toContain('itn');
    expect(SUPPORTED_FORMATS).toContain('asc');
    expect(SUPPORTED_FORMATS).toContain('ov2');
    expect(SUPPORTED_FORMATS).toContain('bcr');
    expect(SUPPORTED_FORMATS).toContain('trk');
    expect(SUPPORTED_FORMATS).toContain('mps');
    expect(SUPPORTED_FORMATS).toContain('fit');
  });

  it('should return correct exporter for each format', () => {
    expect(getExporter('gpx')).toBeInstanceOf(GpxExporter);
    expect(getExporter('itn')).toBeInstanceOf(ItnExporter);
    expect(getExporter('asc')).toBeInstanceOf(AscExporter);
    expect(getExporter('ov2')).toBeInstanceOf(Ov2Exporter);
    expect(getExporter('bcr')).toBeInstanceOf(BcrExporter);
    expect(getExporter('trk')).toBeInstanceOf(TrkExporter);
    expect(getExporter('mps')).toBeInstanceOf(MpsExporter);
    expect(getExporter('fit')).toBeInstanceOf(FitExporter);
  });

  it('should throw for unsupported format', () => {
    expect(() => getExporter('xyz' as any)).toThrow('Unsupported export format: xyz');
  });

  it('should correctly identify supported formats', () => {
    expect(isFormatSupported('gpx')).toBe(true);
    expect(isFormatSupported('itn')).toBe(true);
    expect(isFormatSupported('xyz')).toBe(false);
    expect(isFormatSupported('')).toBe(false);
  });

  it('should return all exporters', () => {
    const exporters = getAllExporters();
    expect(exporters).toHaveLength(8);
  });

  it('all exporters should produce valid Buffer output for valid input', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);

    for (const format of SUPPORTED_FORMATS) {
      const exp = getExporter(format);
      const buffer = exp.export(route, waypoints);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  it('all exporters should validate successfully for valid input', () => {
    const route = createRoute();
    const waypoints = createWaypoints(3);

    for (const format of SUPPORTED_FORMATS) {
      const exp = getExporter(format);
      const result = exp.validate(route, waypoints);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });
});
