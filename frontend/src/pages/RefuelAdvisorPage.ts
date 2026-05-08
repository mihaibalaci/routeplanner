/**
 * Refuel Advisor Page — Modern design
 */

export class RefuelAdvisorPage {
  private container: HTMLElement;
  private error: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
  }

  private build(): string {
    return `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Refuel Stops</h1>
          <p class="page-header__subtitle">Smart refueling suggestions along your route.</p>
        </div>

        ${this.error ? `<div class="alert alert--error" style="margin-bottom:var(--space-4);">${this.error}</div>` : ''}

        <div class="card">
          <div class="card__title">How it works</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-6);margin-top:var(--space-4);">
            <div style="text-align:center;">
              <span class="material-symbols-rounded" style="font-size:36px;color:var(--color-primary);">route</span>
              <p style="font-weight:600;margin-top:var(--space-2);">1. Calculate Route</p>
              <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">Plan your multi-stop route first.</p>
            </div>
            <div style="text-align:center;">
              <span class="material-symbols-rounded" style="font-size:36px;color:var(--color-primary);">directions_car</span>
              <p style="font-weight:600;margin-top:var(--space-2);">2. Select Vehicle</p>
              <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">Choose your vehicle profile for range calculation.</p>
            </div>
            <div style="text-align:center;">
              <span class="material-symbols-rounded" style="font-size:36px;color:var(--color-primary);">local_gas_station</span>
              <p style="font-weight:600;margin-top:var(--space-2);">3. Get Suggestions</p>
              <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">We find the cheapest stations before you run low.</p>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:var(--space-4);">
          <div class="card__title">Suggest Refuel Stops</div>
          <div class="card__subtitle" style="margin-bottom:var(--space-4);">Enter your route and vehicle to get suggestions.</div>
          <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;">
            <div class="input-group" style="flex:1;min-width:200px;">
              <label class="input-group__label">Route ID</label>
              <input class="input" type="text" id="refuel-route-id" placeholder="From route planner" />
            </div>
            <div class="input-group" style="flex:1;min-width:200px;">
              <label class="input-group__label">Vehicle ID</label>
              <input class="input" type="text" id="refuel-vehicle-id" placeholder="From vehicle profile" />
            </div>
            <div style="display:flex;align-items:end;">
              <button id="btn-suggest" class="btn btn--primary btn--lg">
                <span class="material-symbols-rounded">search</span> Find Stops
              </button>
            </div>
          </div>
          <div id="suggestions-result" style="margin-top:var(--space-4);"></div>
        </div>
      </div>
    `;
  }
}
