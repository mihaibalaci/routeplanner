/**
 * Manual Fuel Calculator Page
 *
 * A standalone fuel cost calculator that doesn't require a route or account.
 * Users enter distance, fuel efficiency, and price to get instant cost estimates.
 *
 * Features:
 * - Imperial/Metric toggle
 * - Round trip option
 * - Carpool cost splitting
 * - Annual cost projection
 * - Save/load trips (localStorage)
 * - Instant calculation (no backend needed)
 */

type UnitSystem = 'imperial' | 'metric';

interface CalculationResult {
  fuelNeeded: number;
  totalCost: number;
  costPerKmOrMile: number;
  annualCost?: number;
  perPersonCost?: number;
}

interface SavedTrip {
  id: string;
  name: string;
  distance: number;
  efficiency: number;
  price: number;
  unitSystem: UnitSystem;
  roundTrip: boolean;
  passengers: number;
  result: CalculationResult;
  savedAt: string;
}

const SAVED_TRIPS_KEY = 'routeplanner_saved_fuel_calcs';
const MAX_SAVED_TRIPS = 10;

export class FuelCalculatorPage {
  private container: HTMLElement;
  private unitSystem: UnitSystem = 'metric';
  private distance = 0;
  private efficiency = 0;
  private pricePerUnit = 0;
  private roundTrip = false;
  private splitCost = false;
  private passengers = 2;
  private calculateAnnual = false;
  private tripsPerYear = 50;
  private result: CalculationResult | null = null;
  private savedTrips: SavedTrip[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.loadSavedTrips();
  }

  render(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private buildTemplate(): string {
    return `
      <div class="fuel-calc-page">
        <div class="mdl-card mdl-shadow--2dp app-card fuel-calc-card">
          <div class="mdl-card__title">
            <h2 class="mdl-card__title-text">
              <i class="material-icons">local_gas_station</i>&nbsp;Fuel Cost Calculator
            </h2>
          </div>
          <div class="mdl-card__supporting-text">
            <p class="fuel-calc-subtitle">Quick fuel cost estimate — no route or account needed.</p>

            ${this.buildUnitToggle()}
            ${this.buildInputForm()}
            ${this.buildOptions()}
            ${this.buildCalculateButton()}
            ${this.result ? this.buildResults() : ''}
          </div>
        </div>

        ${this.savedTrips.length > 0 ? this.buildSavedTrips() : ''}
      </div>
    `;
  }

  private buildUnitToggle(): string {
    return `
      <div class="fuel-calc-toggle">
        <button id="btn-imperial" class="mdl-button mdl-js-button ${this.unitSystem === 'imperial' ? 'mdl-button--colored mdl-button--raised' : ''}">
          Imperial (mi, MPG, gal)
        </button>
        <button id="btn-metric" class="mdl-button mdl-js-button ${this.unitSystem === 'metric' ? 'mdl-button--colored mdl-button--raised' : ''}">
          Metric (km, L/100km, L)
        </button>
      </div>
    `;
  }

  private buildInputForm(): string {
    const distanceLabel = this.unitSystem === 'imperial' ? 'Distance (miles)' : 'Distance (km)';
    const efficiencyLabel = this.unitSystem === 'imperial' ? 'Fuel Efficiency (MPG)' : 'Fuel Consumption (L/100km)';
    const priceLabel = this.unitSystem === 'imperial' ? 'Price per Gallon ($)' : 'Price per Liter (€)';

    return `
      <div class="fuel-calc-inputs">
        <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
          <input class="mdl-textfield__input" type="number" id="calc-distance"
                 min="0" step="1" value="${this.distance || ''}" />
          <label class="mdl-textfield__label" for="calc-distance">${distanceLabel}</label>
        </div>

        <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
          <input class="mdl-textfield__input" type="number" id="calc-efficiency"
                 min="0.1" step="0.1" value="${this.efficiency || ''}" />
          <label class="mdl-textfield__label" for="calc-efficiency">${efficiencyLabel}</label>
        </div>

        <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
          <input class="mdl-textfield__input" type="number" id="calc-price"
                 min="0.01" step="0.01" value="${this.pricePerUnit || ''}" />
          <label class="mdl-textfield__label" for="calc-price">${priceLabel}</label>
        </div>
      </div>
    `;
  }

  private buildOptions(): string {
    return `
      <div class="fuel-calc-options">
        <label class="mdl-checkbox mdl-js-checkbox mdl-js-ripple-effect" for="opt-roundtrip">
          <input type="checkbox" id="opt-roundtrip" class="mdl-checkbox__input" ${this.roundTrip ? 'checked' : ''} />
          <span class="mdl-checkbox__label">Round Trip (double distance)</span>
        </label>

        <label class="mdl-checkbox mdl-js-checkbox mdl-js-ripple-effect" for="opt-split">
          <input type="checkbox" id="opt-split" class="mdl-checkbox__input" ${this.splitCost ? 'checked' : ''} />
          <span class="mdl-checkbox__label">Split Cost (carpool)</span>
        </label>

        ${this.splitCost ? `
        <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field" style="width:120px;display:inline-block;margin-left:16px;">
          <input class="mdl-textfield__input" type="number" id="calc-passengers"
                 min="2" max="10" value="${this.passengers}" />
          <label class="mdl-textfield__label" for="calc-passengers">Passengers</label>
        </div>
        ` : ''}

        <label class="mdl-checkbox mdl-js-checkbox mdl-js-ripple-effect" for="opt-annual">
          <input type="checkbox" id="opt-annual" class="mdl-checkbox__input" ${this.calculateAnnual ? 'checked' : ''} />
          <span class="mdl-checkbox__label">Calculate Annual Cost</span>
        </label>

        ${this.calculateAnnual ? `
        <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field" style="width:140px;display:inline-block;margin-left:16px;">
          <input class="mdl-textfield__input" type="number" id="calc-trips-year"
                 min="1" max="365" value="${this.tripsPerYear}" />
          <label class="mdl-textfield__label" for="calc-trips-year">Trips per year</label>
        </div>
        ` : ''}
      </div>
    `;
  }

  private buildCalculateButton(): string {
    return `
      <div class="fuel-calc-actions">
        <button id="btn-calculate"
                class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect">
          <i class="material-icons">calculate</i>&nbsp;Calculate Fuel Cost
        </button>
      </div>
    `;
  }

  private buildResults(): string {
    if (!this.result) return '';

    const distUnit = this.unitSystem === 'imperial' ? 'mi' : 'km';
    const volUnit = this.unitSystem === 'imperial' ? 'gallons' : 'liters';
    const currency = this.unitSystem === 'imperial' ? '$' : '€';

    return `
      <div class="fuel-calc-results mdl-shadow--2dp">
        <h5 class="fuel-calc-results__title">
          <i class="material-icons">check_circle</i>&nbsp;Results
        </h5>

        <div class="fuel-calc-results__grid">
          <div class="fuel-calc-result-item">
            <span class="fuel-calc-result-label">Fuel Needed</span>
            <span class="fuel-calc-result-value">${this.result.fuelNeeded.toFixed(2)} ${volUnit}</span>
          </div>

          <div class="fuel-calc-result-item fuel-calc-result-item--primary">
            <span class="fuel-calc-result-label">Total Cost</span>
            <span class="fuel-calc-result-value">${currency}${this.result.totalCost.toFixed(2)}</span>
          </div>

          <div class="fuel-calc-result-item">
            <span class="fuel-calc-result-label">Cost per ${distUnit}</span>
            <span class="fuel-calc-result-value">${currency}${this.result.costPerKmOrMile.toFixed(4)}</span>
          </div>

          ${this.result.perPersonCost !== undefined ? `
          <div class="fuel-calc-result-item">
            <span class="fuel-calc-result-label">Cost per Person (${this.passengers} people)</span>
            <span class="fuel-calc-result-value">${currency}${this.result.perPersonCost.toFixed(2)}</span>
          </div>
          ` : ''}

          ${this.result.annualCost !== undefined ? `
          <div class="fuel-calc-result-item">
            <span class="fuel-calc-result-label">Annual Cost (${this.tripsPerYear} trips)</span>
            <span class="fuel-calc-result-value">${currency}${this.result.annualCost.toFixed(2)}</span>
          </div>
          ` : ''}
        </div>

        <div class="fuel-calc-results__actions">
          <button id="btn-save-trip" class="mdl-button mdl-js-button mdl-js-ripple-effect">
            <i class="material-icons">save</i>&nbsp;Save This Calculation
          </button>
        </div>
      </div>
    `;
  }

  private buildSavedTrips(): string {
    const rows = this.savedTrips.map((trip, i) => {
      const currency = trip.unitSystem === 'imperial' ? '$' : '€';
      const distUnit = trip.unitSystem === 'imperial' ? 'mi' : 'km';
      return `
        <tr>
          <td class="mdl-data-table__cell--non-numeric">${trip.name || `Trip ${i + 1}`}</td>
          <td>${trip.distance} ${distUnit}${trip.roundTrip ? ' (RT)' : ''}</td>
          <td>${currency}${trip.result.totalCost.toFixed(2)}</td>
          <td>${new Date(trip.savedAt).toLocaleDateString()}</td>
          <td class="mdl-data-table__cell--non-numeric">
            <button class="mdl-button mdl-button--icon btn-load-trip" data-index="${i}" title="Load">
              <i class="material-icons">replay</i>
            </button>
            <button class="mdl-button mdl-button--icon btn-delete-trip" data-index="${i}" title="Delete" style="color:#d32f2f;">
              <i class="material-icons">delete</i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="mdl-card mdl-shadow--2dp app-card" style="margin-top:16px;">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">bookmark</i>&nbsp;Saved Calculations
          </h2>
        </div>
        <div class="mdl-card__supporting-text">
          <table class="mdl-data-table mdl-js-data-table" style="width:100%;">
            <thead>
              <tr>
                <th class="mdl-data-table__cell--non-numeric">Name</th>
                <th>Distance</th>
                <th>Cost</th>
                <th>Date</th>
                <th class="mdl-data-table__cell--non-numeric">Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- Calculation Logic ---

  private calculate(): void {
    if (!this.distance || !this.efficiency || !this.pricePerUnit) {
      return;
    }

    const effectiveDistance = this.roundTrip ? this.distance * 2 : this.distance;
    let fuelNeeded: number;

    if (this.unitSystem === 'imperial') {
      // Imperial: distance (miles) / MPG = gallons needed
      fuelNeeded = effectiveDistance / this.efficiency;
    } else {
      // Metric: (L/100km) * distance(km) / 100 = liters needed
      fuelNeeded = (this.efficiency * effectiveDistance) / 100;
    }

    const totalCost = fuelNeeded * this.pricePerUnit;
    const costPerKmOrMile = totalCost / effectiveDistance;

    this.result = {
      fuelNeeded,
      totalCost: Math.round(totalCost * 100) / 100,
      costPerKmOrMile,
    };

    if (this.splitCost && this.passengers > 1) {
      this.result.perPersonCost = Math.round((totalCost / this.passengers) * 100) / 100;
    }

    if (this.calculateAnnual && this.tripsPerYear > 0) {
      this.result.annualCost = Math.round(totalCost * this.tripsPerYear * 100) / 100;
    }
  }

  // --- Event Binding ---

  private bindEvents(): void {
    // Unit toggle
    this.container.querySelector('#btn-imperial')?.addEventListener('click', () => {
      this.unitSystem = 'imperial';
      this.result = null;
      this.rerender();
    });
    this.container.querySelector('#btn-metric')?.addEventListener('click', () => {
      this.unitSystem = 'metric';
      this.result = null;
      this.rerender();
    });

    // Calculate button
    this.container.querySelector('#btn-calculate')?.addEventListener('click', () => {
      this.readInputs();
      this.calculate();
      this.rerender();
    });

    // Options checkboxes
    this.container.querySelector('#opt-roundtrip')?.addEventListener('change', (e) => {
      this.roundTrip = (e.target as HTMLInputElement).checked;
      if (this.result) { this.readInputs(); this.calculate(); this.rerender(); }
    });
    this.container.querySelector('#opt-split')?.addEventListener('change', (e) => {
      this.splitCost = (e.target as HTMLInputElement).checked;
      this.rerender();
    });
    this.container.querySelector('#opt-annual')?.addEventListener('change', (e) => {
      this.calculateAnnual = (e.target as HTMLInputElement).checked;
      this.rerender();
    });

    // Save trip
    this.container.querySelector('#btn-save-trip')?.addEventListener('click', () => this.saveTrip());

    // Load/delete saved trips
    this.container.querySelectorAll('.btn-load-trip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0');
        this.loadTrip(idx);
      });
    });
    this.container.querySelectorAll('.btn-delete-trip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0');
        this.deleteTrip(idx);
      });
    });
  }

  private readInputs(): void {
    const distEl = this.container.querySelector('#calc-distance') as HTMLInputElement;
    const effEl = this.container.querySelector('#calc-efficiency') as HTMLInputElement;
    const priceEl = this.container.querySelector('#calc-price') as HTMLInputElement;
    const passEl = this.container.querySelector('#calc-passengers') as HTMLInputElement;
    const tripsEl = this.container.querySelector('#calc-trips-year') as HTMLInputElement;

    if (distEl) this.distance = parseFloat(distEl.value) || 0;
    if (effEl) this.efficiency = parseFloat(effEl.value) || 0;
    if (priceEl) this.pricePerUnit = parseFloat(priceEl.value) || 0;
    if (passEl) this.passengers = parseInt(passEl.value) || 2;
    if (tripsEl) this.tripsPerYear = parseInt(tripsEl.value) || 50;
  }

  // --- Save/Load ---

  private saveTrip(): void {
    if (!this.result) return;

    const name = prompt('Name this calculation (optional):') || `Trip ${this.savedTrips.length + 1}`;

    const trip: SavedTrip = {
      id: `trip_${Date.now()}`,
      name,
      distance: this.distance,
      efficiency: this.efficiency,
      price: this.pricePerUnit,
      unitSystem: this.unitSystem,
      roundTrip: this.roundTrip,
      passengers: this.passengers,
      result: this.result,
      savedAt: new Date().toISOString(),
    };

    this.savedTrips.unshift(trip);
    if (this.savedTrips.length > MAX_SAVED_TRIPS) {
      this.savedTrips = this.savedTrips.slice(0, MAX_SAVED_TRIPS);
    }

    this.persistSavedTrips();
    this.rerender();
  }

  private loadTrip(index: number): void {
    const trip = this.savedTrips[index];
    if (!trip) return;

    this.unitSystem = trip.unitSystem;
    this.distance = trip.distance;
    this.efficiency = trip.efficiency;
    this.pricePerUnit = trip.price;
    this.roundTrip = trip.roundTrip;
    this.passengers = trip.passengers;
    this.result = trip.result;
    this.rerender();
  }

  private deleteTrip(index: number): void {
    this.savedTrips.splice(index, 1);
    this.persistSavedTrips();
    this.rerender();
  }

  private loadSavedTrips(): void {
    try {
      const stored = localStorage.getItem(SAVED_TRIPS_KEY);
      if (stored) {
        this.savedTrips = JSON.parse(stored);
      }
    } catch {
      this.savedTrips = [];
    }
  }

  private persistSavedTrips(): void {
    localStorage.setItem(SAVED_TRIPS_KEY, JSON.stringify(this.savedTrips));
  }

  // --- Helpers ---

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
