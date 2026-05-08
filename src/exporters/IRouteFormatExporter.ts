/**
 * Route Format Exporter Interface and Types
 * Implements the strategy pattern for route export in multiple navigation formats.
 */

import { Route, Waypoint } from '../models/route';

export type ExportFormat = 'gpx' | 'itn' | 'asc' | 'ov2' | 'bcr' | 'trk' | 'mps' | 'fit';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface IRouteFormatExporter {
  /** The export format identifier */
  format: ExportFormat;

  /** Maximum number of waypoints supported by this format, null = unlimited */
  maxWaypoints: number | null;

  /** Export a route with its waypoints to the target format */
  export(route: Route, waypoints: Waypoint[]): Buffer;

  /** Validate that a route can be exported in this format */
  validate(route: Route, waypoints: Waypoint[]): ValidationResult;
}
