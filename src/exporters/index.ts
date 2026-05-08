/**
 * Route Exporter Registry
 * Factory that returns the correct exporter by format.
 */

import { ExportFormat, IRouteFormatExporter } from './IRouteFormatExporter';
import { GpxExporter } from './GpxExporter';
import { ItnExporter } from './ItnExporter';
import { AscExporter } from './AscExporter';
import { Ov2Exporter } from './Ov2Exporter';
import { BcrExporter } from './BcrExporter';
import { TrkExporter } from './TrkExporter';
import { MpsExporter } from './MpsExporter';
import { FitExporter } from './FitExporter';

export { ExportFormat, IRouteFormatExporter, ValidationResult } from './IRouteFormatExporter';
export { GpxExporter } from './GpxExporter';
export { ItnExporter } from './ItnExporter';
export { AscExporter } from './AscExporter';
export { Ov2Exporter } from './Ov2Exporter';
export { BcrExporter } from './BcrExporter';
export { TrkExporter } from './TrkExporter';
export { MpsExporter } from './MpsExporter';
export { FitExporter } from './FitExporter';

/** All supported export formats */
export const SUPPORTED_FORMATS: ExportFormat[] = [
  'gpx',
  'itn',
  'asc',
  'ov2',
  'bcr',
  'trk',
  'mps',
  'fit',
];

/** Registry of all available exporters */
const exporterRegistry: Map<ExportFormat, IRouteFormatExporter> = new Map([
  ['gpx', new GpxExporter()],
  ['itn', new ItnExporter()],
  ['asc', new AscExporter()],
  ['ov2', new Ov2Exporter()],
  ['bcr', new BcrExporter()],
  ['trk', new TrkExporter()],
  ['mps', new MpsExporter()],
  ['fit', new FitExporter()],
]);

/**
 * Get an exporter for the specified format.
 * @throws Error if format is not supported
 */
export function getExporter(format: ExportFormat): IRouteFormatExporter {
  const exporter = exporterRegistry.get(format);
  if (!exporter) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  return exporter;
}

/**
 * Get all available exporters.
 */
export function getAllExporters(): IRouteFormatExporter[] {
  return Array.from(exporterRegistry.values());
}

/**
 * Check if a format is supported.
 */
export function isFormatSupported(format: string): format is ExportFormat {
  return SUPPORTED_FORMATS.includes(format as ExportFormat);
}
