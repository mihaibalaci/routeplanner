/**
 * Fuel Calculator Page — Modern design
 */

type UnitSystem = 'imperial' | 'metric';
type EnergyMode = 'fuel' | 'electric';

interface CalcResult {
  fuelNeeded: number;
  totalCost: number;
  costPerUnit: number;
  perPersonCost?: number;
  annualCost?: number;
}

export class FuelCalculatorPage {
  private container: HTMLElement;
  private units: UnitSystem = 'metric';
  private energyMode: EnergyMode = 'fuel';
  private distance = 0;
  private efficiency = 0;
  private price = 0;
  private roundTrip = false;
  private splitCost = false;
  private passengers = 2;
  private calcAnnual = false;
  private tripsPerYear = 50;
  private result: CalcResult | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }

  private build(): string {
    const isElectric = this.energyMode === 'electric';
    const distLabel = this.units === 'imperial' ? 'Distance (miles)' : 'Distance (km)';
    const effLabel = isElectric
      ? 'Consumption (kWh/100km)'
      : this.units === 'imperial' ? 'Fuel efficiency (MPG)' : 'Consumption (L/100km)';
    const priceLabel = isElectric
      ? 'Electricity price (€/kWh)'
      : this.units === 'imperial' ? 'Price per gallon ($)' : 'Price per liter (€)';

    return `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Fuel Cost Calculator</h1>
          <p class="page-header__subtitle">Quick estimate — no route or account needed.</p>
        </div>

        <div class="card card--elevated">
          <div class="calc-toggle" style="margin-bottom:var(--space-3);">
            <button class="calc-toggle__btn ${this.energyMode === 'fuel' ? 'is-active' : ''}" data-mode="fuel">
              <span class="material-symbols-rounded" style="font-size:16px;">local_gas_station</span> Fuel
            </button>
            <button class="calc-toggle__btn ${this.energyMode === 'electric' ? 'is-active' : ''}" data-mode="electric">
              <span class="material-symbols-rounded" style="font-size:16px;">electric_car</span> Electric
            </button>
          </div>

          ${!isElectric ? `
          <div class="calc-toggle">
            <button class="calc-toggle__btn ${this.units === 'metric' ? 'is-active' : ''}" data-unit="metric">
              Metric (km, L/100km)
            </button>
            <button class="calc-toggle__btn ${this.units === 'imperial' ? 'is-active' : ''}" data-unit="imperial">
              Imperial (mi, MPG)
            </button>
          </div>` : ''}

          <div style="display:flex;flex-direction:column;gap:var(--space-4);">
            <div class="input-group">
              <label class="input-group__label">${distLabel}</label>
              <input class="input input--lg" type="number" id="calc-dist" min="0" step="1" value="${this.distance || ''}" placeholder="e.g. 500" />
            </div>
            <div class="input-group">
              <label class="input-group__label">${effLabel}</label>
              <input class="input input--lg" type="number" id="calc-eff" min="0.1" step="0.1" value="${this.efficiency || ''}" placeholder="${isElectric ? 'e.g. 15' : this.units === 'imperial' ? 'e.g. 30' : 'e.g. 7.5'}" />
            </div>
            <div class="input-group">
              <label class="input-group__label">${priceLabel}</label>
              <input class="input input--lg" type="number" id="calc-price" min="0.01" step="0.01" value="${this.price || ''}" placeholder="${isElectric ? 'e.g. 0.30' : this.units === 'imperial' ? 'e.g. 3.50' : 'e.g. 1.65'}" />
            </div>
          </div>

          <div class="checkbox-group" style="margin-top:var(--space-4);">
            <label class="checkbox-label">
              <input type="checkbox" id="opt-rt" ${this.roundTrip ? 'checked' : ''} />
              Round trip (double distance)
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="opt-split" ${this.splitCost ? 'checked' : ''} />
              Split cost (carpool)
            </label>
            ${this.splitCost ? `
            <div class="input-group" style="margin-left:24px;max-width:120px;">
              <label class="input-group__label">Passengers</label>
              <input class="input" type="number" id="calc-pass" min="2" max="10" value="${this.passengers}" />
            </div>` : ''}
            <label class="checkbox-label">
              <input type="checkbox" id="opt-annual" ${this.calcAnnual ? 'checked' : ''} />
              Annual projection
            </label>
            ${this.calcAnnual ? `
            <div class="input-group" style="margin-left:24px;max-width:140px;">
              <label class="input-group__label">Trips per year</label>
              <input class="input" type="number" id="calc-trips" min="1" max="365" value="${this.tripsPerYear}" />
            </div>` : ''}
          </div>

          <div style="margin-top:var(--space-6);">
            <button id="btn-calc" class="btn btn--primary btn--lg" style="width:100%;">
              <span class="material-symbols-rounded">calculate</span>
              Calculate
            </button>
          </div>

          ${this.result ? this.buildResults() : ''}
        </div>
      </div>
    `;
  }

  private buildResults(): string {
    if (!this.result) return '';
    const isElectric = this.energyMode === 'electric';
    const volUnit = isElectric ? 'kWh' : this.units === 'imperial' ? 'gal' : 'L';
    const distUnit = this.units === 'imperial' && !isElectric ? 'mi' : 'km';
    const curr = isElectric ? '€' : this.units === 'imperial' ? '$' : '€';

    return `
      <div class="calc-results">
        <div class="calc-results__title">Results</div>
        <div class="calc-results__grid">
          <div class="calc-result-item calc-result-item--highlight">
            <span class="calc-result-item__label">Total Cost</span>
            <span class="calc-result-item__value">${curr}${this.result.totalCost.toFixed(2)}</span>
          </div>
          <div class="calc-result-item">
            <span class="calc-result-item__label">${isElectric ? 'Energy needed' : 'Fuel needed'}</span>
            <span class="calc-result-item__value">${this.result.fuelNeeded.toFixed(1)} ${volUnit}</span>
          </div>
          <div class="calc-result-item">
            <span class="calc-result-item__label">Cost per ${distUnit}</span>
            <span class="calc-result-item__value">${curr}${this.result.costPerUnit.toFixed(3)}</span>
          </div>
          ${this.result.perPersonCost !== undefined ? `
          <div class="calc-result-item">
            <span class="calc-result-item__label">Per person (${this.passengers})</span>
            <span class="calc-result-item__value">${curr}${this.result.perPersonCost.toFixed(2)}</span>
          </div>` : ''}
          ${this.result.annualCost !== undefined ? `
          <div class="calc-result-item">
            <span class="calc-result-item__label">Annual (${this.tripsPerYear} trips)</span>
            <span class="calc-result-item__value">${curr}${this.result.annualCost.toFixed(0)}</span>
          </div>` : ''}
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.energyMode = (e.currentTarget as HTMLElement).dataset.mode as EnergyMode;
        this.result = null;
        this.rerender();
      });
    });

    this.container.querySelectorAll('[data-unit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.units = (e.currentTarget as HTMLElement).dataset.unit as UnitSystem;
        this.result = null;
        this.rerender();
      });
    });

    this.container.querySelector('#btn-calc')?.addEventListener('click', () => {
      this.readInputs();
      this.calculate();
      this.rerender();
    });

    this.container.querySelector('#opt-rt')?.addEventListener('change', (e) => {
      this.roundTrip = (e.target as HTMLInputElement).checked;
      if (this.result) { this.readInputs(); this.calculate(); this.rerender(); }
    });
    this.container.querySelector('#opt-split')?.addEventListener('change', (e) => {
      this.splitCost = (e.target as HTMLInputElement).checked;
      this.rerender();
    });
    this.container.querySelector('#opt-annual')?.addEventListener('change', (e) => {
      this.calcAnnual = (e.target as HTMLInputElement).checked;
      this.rerender();
    });
  }

  private readInputs(): void {
    const d = this.container.querySelector('#calc-dist') as HTMLInputElement;
    const e = this.container.querySelector('#calc-eff') as HTMLInputElement;
    const p = this.container.querySelector('#calc-price') as HTMLInputElement;
    const pass = this.container.querySelector('#calc-pass') as HTMLInputElement;
    const trips = this.container.querySelector('#calc-trips') as HTMLInputElement;
    if (d) this.distance = parseFloat(d.value) || 0;
    if (e) this.efficiency = parseFloat(e.value) || 0;
    if (p) this.price = parseFloat(p.value) || 0;
    if (pass) this.passengers = parseInt(pass.value) || 2;
    if (trips) this.tripsPerYear = parseInt(trips.value) || 50;
  }

  private calculate(): void {
    if (!this.distance || !this.efficiency || !this.price) return;
    const dist = this.roundTrip ? this.distance * 2 : this.distance;

    let fuel: number;
    let cost: number;

    if (this.energyMode === 'electric') {
      // Electric: (distance / 100) × consumption_kWh × price_per_kWh
      fuel = (this.efficiency * dist) / 100; // kWh needed
      cost = fuel * this.price;
    } else if (this.units === 'imperial') {
      fuel = dist / this.efficiency;
      cost = fuel * this.price;
    } else {
      fuel = (this.efficiency * dist) / 100;
      cost = fuel * this.price;
    }

    this.result = {
      fuelNeeded: fuel,
      totalCost: Math.round(cost * 100) / 100,
      costPerUnit: cost / dist,
    };
    if (this.splitCost && this.passengers > 1) this.result.perPersonCost = cost / this.passengers;
    if (this.calcAnnual) this.result.annualCost = cost * this.tripsPerYear;
  }

  private rerender(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }
}
