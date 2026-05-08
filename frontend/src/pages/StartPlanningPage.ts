/**
 * Start Planning Page — Modern wizard
 */

type VehicleType = 'car' | 'motorcycle' | 'camper';

interface WizardState {
  step: 1 | 2 | 3;
  vehicleType: VehicleType | null;
  destination: string;
  startDate: string;
}

export class StartPlanningPage {
  private container: HTMLElement;
  private state: WizardState = { step: 1, vehicleType: null, destination: '', startDate: '' };

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
  }

  private buildTemplate(): string {
    return `
      <div class="wizard">
        ${this.buildStepper()}
        <div class="wizard__content">
          ${this.renderStep()}
        </div>
      </div>
    `;
  }

  private buildStepper(): string {
    return `
      <div class="wizard__stepper">
        ${[1, 2, 3].map(n => `
          <span class="wizard__dot ${n === this.state.step ? 'is-active' : ''} ${n < this.state.step ? 'is-complete' : ''}"></span>
        `).join('')}
      </div>
    `;
  }

  private renderStep(): string {
    switch (this.state.step) {
      case 1: return this.stepLanding();
      case 2: return this.stepVehicle();
      case 3: return this.stepDestination();
    }
  }

  private stepLanding(): string {
    return `
      <div class="wizard__icon">
        <span class="material-symbols-rounded">explore</span>
      </div>
      <h1 class="wizard__title">Plan your next road trip</h1>
      <p class="wizard__subtitle">
        Multi-stop routes across Europe with fuel costs, refuel stops, and vignette tracking — all in one place.
      </p>
      <button id="btn-start" class="btn btn--primary btn--xl">
        Start Planning
        <span class="material-symbols-rounded">arrow_forward</span>
      </button>
    `;
  }

  private stepVehicle(): string {
    const vehicles = [
      { type: 'car', icon: 'directions_car', name: 'Car', desc: 'Sedans, SUVs, hatchbacks' },
      { type: 'motorcycle', icon: 'two_wheeler', name: 'Motorcycle', desc: 'Vignette-exempt in some countries' },
      { type: 'camper', icon: 'rv_hookup', name: 'Camper', desc: 'RVs and motorhomes' },
    ];

    return `
      <h2 class="wizard__title">What are you driving?</h2>
      <p class="wizard__subtitle">This helps calculate fuel costs and vignette requirements.</p>
      <div class="vehicle-grid">
        ${vehicles.map(v => `
          <button class="vehicle-option ${this.state.vehicleType === v.type ? 'is-selected' : ''}" data-vehicle="${v.type}">
            <span class="material-symbols-rounded vehicle-option__icon">${v.icon}</span>
            <span class="vehicle-option__name">${v.name}</span>
            <span class="vehicle-option__desc">${v.desc}</span>
          </button>
        `).join('')}
      </div>
      <div class="wizard__actions">
        <button id="btn-back" class="btn btn--ghost">
          <span class="material-symbols-rounded">arrow_back</span> Back
        </button>
        <span></span>
      </div>
    `;
  }

  private stepDestination(): string {
    const today = new Date().toISOString().split('T')[0];
    return `
      <h2 class="wizard__title">Where are you headed?</h2>
      <p class="wizard__subtitle">Enter your first destination and departure date.</p>
      <form id="wizard-form" class="wizard__form">
        <div class="input-group">
          <label class="input-group__label" for="dest-input">Destination</label>
          <input class="input input--lg" type="text" id="dest-input"
                 placeholder="e.g. Vienna, Austria" value="${this.state.destination}" required />
        </div>
        <div class="input-group">
          <label class="input-group__label" for="date-input">Departure date</label>
          <input class="input input--lg" type="date" id="date-input"
                 min="${today}" value="${this.state.startDate || today}" required />
        </div>
        <div class="wizard__actions">
          <button type="button" id="btn-back" class="btn btn--ghost">
            <span class="material-symbols-rounded">arrow_back</span> Back
          </button>
          <button type="submit" class="btn btn--primary btn--lg">
            Plan my route
            <span class="material-symbols-rounded">arrow_forward</span>
          </button>
        </div>
      </form>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-start')?.addEventListener('click', () => this.goTo(2));

    this.container.querySelectorAll('.vehicle-option').forEach(el => {
      el.addEventListener('click', (e) => {
        this.state.vehicleType = (e.currentTarget as HTMLElement).dataset.vehicle as VehicleType;
        this.rerender();
        setTimeout(() => this.goTo(3), 200);
      });
    });

    this.container.querySelector('#btn-back')?.addEventListener('click', () => {
      this.goTo((this.state.step - 1) as 1 | 2);
    });

    this.container.querySelector('#wizard-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const dest = (this.container.querySelector('#dest-input') as HTMLInputElement).value.trim();
      const date = (this.container.querySelector('#date-input') as HTMLInputElement).value;
      if (!dest || !date) return;
      this.state.destination = dest;
      this.state.startDate = date;

      const params = new URLSearchParams({
        vehicle: this.state.vehicleType || 'car',
        destination: dest,
        date,
      });
      window.history.pushState({}, '', `/?${params}`);
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/' } }));
    });
  }

  private goTo(step: 1 | 2 | 3): void {
    this.state.step = step;
    this.rerender();
  }

  private rerender(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
  }
}
