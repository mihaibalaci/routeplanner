/**
 * Route Planner Page — Modern design
 */


export class RoutePlannerPage {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }

  private build(): string {
    return `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Route Planner</h1>
          <p class="page-header__subtitle">Plan your multi-stop driving route across Europe.</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
          <div class="card" style="grid-column:1/3;">
            <div style="display:flex;flex-direction:column;gap:var(--space-4);">
              <div class="input-group">
                <label class="input-group__label">Origin</label>
                <input class="input input--lg" type="text" id="origin-input" placeholder="Starting point (e.g. Vienna, Austria)" />
              </div>
              <div id="stops-container"></div>
              <div class="input-group">
                <label class="input-group__label">Destination</label>
                <input class="input input--lg" type="text" id="dest-input" placeholder="Final destination (e.g. Budapest, Hungary)" />
              </div>
              <div style="display:flex;gap:var(--space-2);">
                <button id="btn-add-stop" class="btn btn--secondary">
                  <span class="material-symbols-rounded">add_location</span> Add Stop
                </button>
                <button id="btn-calculate" class="btn btn--primary btn--lg" style="flex:1;">
                  <span class="material-symbols-rounded">directions</span> Calculate Route
                </button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__title">Route Summary</div>
            <div class="card__subtitle">Calculate a route to see distance and time estimates.</div>
            <div id="route-summary" style="margin-top:var(--space-4);">
              <div class="empty-state" style="padding:var(--space-6) 0;">
                <span class="material-symbols-rounded empty-state__icon">route</span>
                <p class="empty-state__text">No route calculated yet</p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__title">Map</div>
            <div id="map-container" style="height:300px;background:var(--color-bg);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);margin-top:var(--space-3);">
              <div style="text-align:center;">
                <span class="material-symbols-rounded" style="font-size:48px;">map</span>
                <p style="font-size:var(--font-size-sm);margin-top:var(--space-2);">Map requires Google Maps API key</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-add-stop')?.addEventListener('click', () => this.addStop());
    this.container.querySelector('#btn-calculate')?.addEventListener('click', () => this.calculate());
  }

  private addStop(): void {
    const container = this.container.querySelector('#stops-container');
    if (!container) return;
    const count = container.children.length;
    const div = document.createElement('div');
    div.className = 'input-group';
    div.style.display = 'flex';
    div.style.gap = 'var(--space-2)';
    div.style.alignItems = 'end';
    div.innerHTML = `
      <div style="flex:1;">
        <label class="input-group__label">Stop ${count + 1}</label>
        <input class="input" type="text" placeholder="Intermediate stop" />
      </div>
      <button class="btn btn--ghost btn-remove-stop" style="padding:var(--space-2);">
        <span class="material-symbols-rounded">close</span>
      </button>
    `;
    div.querySelector('.btn-remove-stop')?.addEventListener('click', () => div.remove());
    container.appendChild(div);
  }

  private async calculate(): Promise<void> {
    const origin = (this.container.querySelector('#origin-input') as HTMLInputElement)?.value.trim();
    const dest = (this.container.querySelector('#dest-input') as HTMLInputElement)?.value.trim();
    if (!origin || !dest) {
      const summary = this.container.querySelector('#route-summary');
      if (summary) summary.innerHTML = '<div class="alert alert--warning">Please enter origin and destination.</div>';
      return;
    }
    const summary = this.container.querySelector('#route-summary');
    if (summary) {
      summary.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Calculating route...</span></div>';
    }
    // In a real implementation this would call the API
    setTimeout(() => {
      if (summary) {
        summary.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:var(--space-3);">
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--color-text-secondary);">Distance</span>
              <strong>— km</strong>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--color-text-secondary);">Duration</span>
              <strong>— h</strong>
            </div>
            <div class="alert alert--warning" style="margin-top:var(--space-2);">
              <span class="material-symbols-rounded">info</span>
              Route calculation requires Google Maps API key configuration.
            </div>
          </div>
        `;
      }
    }, 1000);
  }
}
