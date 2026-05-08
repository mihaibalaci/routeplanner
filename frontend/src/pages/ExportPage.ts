/**
 * Export Page
 *
 * Route export UI with:
 * - Format selection (GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT) as MDL radio buttons
 * - "Export" button that calls POST /routes/:id/export
 * - Download the exported file(s) (decode base64 from response)
 * - Notify user when route is split into multiple files
 *
 * Requirements: 9.1, 9.2, 9.5
 */

import { apiClient, ApiError } from '../api/client';

interface ExportedFile {
  filename: string;
  content: string; // base64 encoded
  mimeType: string;
}

interface ExportResponse {
  files: ExportedFile[];
  splitNotice?: string;
}

const EXPORT_FORMATS = [
  { value: 'gpx', label: 'GPX', description: 'GPS Exchange Format (universal)' },
  { value: 'itn', label: 'ITN', description: 'TomTom Itinerary' },
  { value: 'asc', label: 'ASC', description: 'ASCII Waypoint Format' },
  { value: 'ov2', label: 'OV2', description: 'TomTom POI Format' },
  { value: 'bcr', label: 'BCR', description: 'Map&Guide Route' },
  { value: 'trk', label: 'TRK', description: 'CompeGPS Track' },
  { value: 'mps', label: 'MPS', description: 'Map&Guide MapSource' },
  { value: 'fit', label: 'FIT', description: 'Garmin FIT' },
];

export class ExportPage {
  private container: HTMLElement;
  private selectedFormat: string = 'gpx';
  private exporting = false;
  private error: string | null = null;
  private successMessage: string | null = null;
  private routeId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.routeId = sessionStorage.getItem('currentRouteId');
  }

  render(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private buildTemplate(): string {
    if (!this.routeId) {
      return `
        <div class="export-page">
          <div class="mdl-card mdl-shadow--2dp app-card" style="background:#f8d7da;">
            <div class="mdl-card__supporting-text" style="color:#721c24;">
              <i class="material-icons" style="vertical-align:middle;">error</i>
              No route selected. Please calculate a route first.
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="export-page">
        <div class="mdl-card mdl-shadow--2dp app-card">
          <div class="mdl-card__title">
            <h2 class="mdl-card__title-text">
              <i class="material-icons">file_download</i>&nbsp;Export Route
            </h2>
          </div>
          <div class="mdl-card__supporting-text">
            <p>Select a format to export your route for GPS navigation devices.</p>

            <div id="format-selection" style="margin-top:16px;">
              ${this.buildFormatOptions()}
            </div>
          </div>

          ${this.error ? `
          <div class="mdl-card__supporting-text" style="background:#f8d7da;color:#721c24;border-radius:4px;margin:0 16px;">
            <i class="material-icons" style="vertical-align:middle;">error</i>
            ${this.error}
          </div>` : ''}

          ${this.successMessage ? `
          <div class="mdl-card__supporting-text" style="background:#d4edda;color:#155724;border-radius:4px;margin:0 16px;">
            <i class="material-icons" style="vertical-align:middle;">check_circle</i>
            ${this.successMessage}
          </div>` : ''}

          <div class="mdl-card__actions mdl-card--border">
            <button id="btn-export"
                    class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect"
                    ${this.exporting ? 'disabled' : ''}>
              ${this.exporting
                ? '<div class="mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active" style="width:20px;height:20px;"></div>&nbsp;Exporting...'
                : '<i class="material-icons">download</i>&nbsp;Export'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private buildFormatOptions(): string {
    return EXPORT_FORMATS.map(
      (fmt) => `
      <label class="mdl-radio mdl-js-radio mdl-js-ripple-effect" for="format-${fmt.value}"
             style="display:block;margin-bottom:8px;">
        <input type="radio" id="format-${fmt.value}" class="mdl-radio__button"
               name="export-format" value="${fmt.value}"
               ${this.selectedFormat === fmt.value ? 'checked' : ''} />
        <span class="mdl-radio__label">
          <strong>${fmt.label}</strong> — ${fmt.description}
        </span>
      </label>
    `
    ).join('');
  }

  private bindEvents(): void {
    // Format selection
    const radios = this.container.querySelectorAll('input[name="export-format"]');
    radios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.selectedFormat = (e.target as HTMLInputElement).value;
      });
    });

    // Export button
    const exportBtn = this.container.querySelector('#btn-export');
    exportBtn?.addEventListener('click', () => this.handleExport());
  }

  private async handleExport(): Promise<void> {
    if (!this.routeId) return;

    this.exporting = true;
    this.error = null;
    this.successMessage = null;
    this.rerender();

    try {
      const res = await apiClient.post<ExportResponse>(
        `/routes/${this.routeId}/export`,
        { format: this.selectedFormat }
      );

      const { files, splitNotice } = res.data;

      // Download each file
      for (const file of files) {
        this.downloadBase64File(file.filename, file.content, file.mimeType);
      }

      // Show success message
      if (splitNotice) {
        this.successMessage = `${splitNotice} (${files.length} files downloaded)`;
      } else if (files.length > 1) {
        this.successMessage = `Route was split into ${files.length} files due to format limitations. All files downloaded.`;
      } else {
        this.successMessage = `Route exported as ${this.selectedFormat.toUpperCase()} successfully.`;
      }
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to export route.';
    } finally {
      this.exporting = false;
      this.rerender();
    }
  }

  private downloadBase64File(filename: string, base64Content: string, mimeType: string): void {
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private rerender(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private upgradeComponents(): void {
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
    }
  }
}
