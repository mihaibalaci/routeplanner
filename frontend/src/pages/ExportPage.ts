/**
 * Export Page — Modern design
 */

const FORMATS = [
  { value: 'gpx', label: 'GPX', desc: 'GPS Exchange Format (universal)' },
  { value: 'itn', label: 'ITN', desc: 'TomTom Itinerary' },
  { value: 'asc', label: 'ASC', desc: 'ASCII Waypoint' },
  { value: 'ov2', label: 'OV2', desc: 'TomTom POI' },
  { value: 'bcr', label: 'BCR', desc: 'Map&Guide Route' },
  { value: 'trk', label: 'TRK', desc: 'CompeGPS Track' },
  { value: 'mps', label: 'MPS', desc: 'Map&Guide MapSource' },
  { value: 'fit', label: 'FIT', desc: 'Garmin FIT' },
];

export class ExportPage {
  private container: HTMLElement;
  private selected = 'gpx';

  constructor(container: HTMLElement) { this.container = container; }

  render(): void {
    this.container.innerHTML = `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Export Route</h1>
          <p class="page-header__subtitle">Download your route for GPS devices and navigation apps.</p>
        </div>
        <div class="card">
          <div class="card__title">Select Format</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--space-3);margin-top:var(--space-4);">
            ${FORMATS.map(f => `
              <label style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);cursor:pointer;transition:all var(--transition-fast);">
                <input type="radio" name="format" value="${f.value}" ${f.value === this.selected ? 'checked' : ''} style="accent-color:var(--color-primary);" />
                <div>
                  <div style="font-weight:600;font-size:var(--font-size-sm);">${f.label}</div>
                  <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${f.desc}</div>
                </div>
              </label>
            `).join('')}
          </div>
          <button class="btn btn--primary btn--lg" style="margin-top:var(--space-6);width:100%;">
            <span class="material-symbols-rounded">download</span> Export Route
          </button>
        </div>
      </div>
    `;
  }
}
