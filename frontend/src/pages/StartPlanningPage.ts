/**
 * Start Planning Page
 *
 * Multi-step "Start Planning" wizard inspired by wanderlog.com.
 *
 * Flow:
 *   Step 1: Landing / CTA ("Start Planning" button)
 *   Step 2: Vehicle type selection (Car, Motorcycle, Camper)
 *   Step 3: Destination & date (Where to? + date picker)
 *
 * On completion, navigates to the Route Planner with collected data
 * via URL query params.
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
  private state: WizardState = {
    step: 1,
    vehicleType: null,
    destination: '',
    startDate: '',
  };

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private buildTemplate(): string {
    return `
      <div class="start-planning">
        ${this.buildStepIndicator()}
        <div class="start-planning__content">
          ${this.renderCurrentStep()}
        </div>
      </div>
    `;
  }

  private buildStepIndicator(): string {
    const dots = [1, 2, 3].map((n) => {
      const isActive = n === this.state.step;
      const isComplete = n < this.state.step;
      return `<span class="step-dot ${isActive ? 'is-active' : ''} ${isComplete ? 'is-complete' : ''}"></span>`;
    }).join('');

    return `<div class="start-planning__stepper">${dots}</div>`;
  }

  private renderCurrentStep(): string {
    switch (this.state.step) {
      case 1:
        return this.renderLanding();
      case 2:
        return this.renderVehicleSelection();
      case 3:
        return this.renderDestinationAndDate();
      default:
        return '';
    }
  }

  // --- Step 1: Landing ---

  private renderLanding(): string {
    return `
      <div class="start-step start-step--landing fade-in">
        <div class="start-step__icon">
          <i class="material-icons">explore</i>
        </div>
        <h1 class="start-step__title">Plan your next European road trip</h1>
        <p class="start-step__subtitle">
          Multi-stop routes, fuel cost estimates, refuel stops, and vignette tracking
          across Europe.
        </p>
        <button id="btn-start"
                class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect start-step__cta">
          Start Planning
          <i class="material-icons" style="margin-left:8px;">arrow_forward</i>
        </button>
      </div>
    `;
  }

  // --- Step 2: Vehicle Selection ---

  private renderVehicleSelection(): string {
    const vehicles: Array<{ type: VehicleType; label: string; icon: string; description: string }> = [
      { type: 'car', label: 'Car', icon: 'directions_car', description: 'Sedans, SUVs, everyday vehicles' },
      { type: 'motorcycle', label: 'Motorcycle', icon: 'two_wheeler', description: 'Exempt from vignettes in some countries' },
      { type: 'camper', label: 'Camper', icon: 'rv_hookup', description: 'RVs and motorhomes' },
    ];

    const cards = vehicles.map((v) => `
      <button class="vehicle-card ${this.state.vehicleType === v.type ? 'is-selected' : ''}"
              data-vehicle="${v.type}">
        <i class="material-icons vehicle-card__icon">${v.icon}</i>
        <div class="vehicle-card__label">${v.label}</div>
        <div class="vehicle-card__description">${v.description}</div>
      </button>
    `).join('');

    return `
      <div class="start-step fade-in">
        <h2 class="start-step__title">What will you be driving?</h2>
        <p class="start-step__subtitle">This helps us calculate fuel costs and vignette requirements.</p>

        <div class="vehicle-grid">
          ${cards}
        </div>

        <div class="start-step__actions">
          <button id="btn-back"
                  class="mdl-button mdl-js-button mdl-js-ripple-effect">
            <i class="material-icons">arrow_back</i>&nbsp;Back
          </button>
        </div>
      </div>
    `;
  }

  // --- Step 3: Destination & Date ---

  private renderDestinationAndDate(): string {
    const today = new Date().toISOString().split('T')[0];
    return `
      <div class="start-step fade-in">
        <h2 class="start-step__title">Where to?</h2>
        <p class="start-step__subtitle">Tell us your first destination and when you want to leave.</p>

        <form id="destination-form" class="destination-form">
          <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
            <input class="mdl-textfield__input" type="text" id="destination-input"
                   value="${this.state.destination}" autocomplete="off" required />
            <label class="mdl-textfield__label" for="destination-input">Where to? (city or address)</label>
          </div>

          <div class="mdl-textfield mdl-js-textfield form-field">
            <input class="mdl-textfield__input" type="date" id="date-input"
                   min="${today}" value="${this.state.startDate || today}" required />
            <label class="mdl-textfield__label" for="date-input" style="top:0;font-size:12px;color:#666;">
              Trip start date
            </label>
          </div>

          <div class="start-step__actions">
            <button type="button" id="btn-back"
                    class="mdl-button mdl-js-button mdl-js-ripple-effect">
              <i class="material-icons">arrow_back</i>&nbsp;Back
            </button>
            <button type="submit" id="btn-submit"
                    class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect">
              Plan my route
              <i class="material-icons" style="margin-left:8px;">arrow_forward</i>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  // --- Event Binding ---

  private bindEvents(): void {
    // Step 1: Start button
    this.container.querySelector('#btn-start')?.addEventListener('click', () => {
      this.goToStep(2);
    });

    // Step 2: Vehicle selection
    this.container.querySelectorAll('.vehicle-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const type = (e.currentTarget as HTMLElement).dataset.vehicle as VehicleType;
        this.state.vehicleType = type;
        // Give a brief highlight moment before advancing
        this.rerender();
        setTimeout(() => this.goToStep(3), 200);
      });
    });

    // Back buttons (steps 2 and 3)
    this.container.querySelector('#btn-back')?.addEventListener('click', () => {
      this.goToStep((this.state.step - 1) as 1 | 2);
    });

    // Step 3: Form submit
    const form = this.container.querySelector('#destination-form') as HTMLFormElement;
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  private goToStep(step: 1 | 2 | 3): void {
    this.state.step = step;
    this.rerender();
  }

  private handleSubmit(): void {
    const destInput = this.container.querySelector('#destination-input') as HTMLInputElement;
    const dateInput = this.container.querySelector('#date-input') as HTMLInputElement;

    this.state.destination = destInput.value.trim();
    this.state.startDate = dateInput.value;

    if (!this.state.destination || !this.state.startDate) {
      return;
    }

    // Pass wizard state to Route Planner via URL query params
    const params = new URLSearchParams({
      vehicle: this.state.vehicleType || 'car',
      destination: this.state.destination,
      date: this.state.startDate,
    });

    const targetPath = `/?${params.toString()}`;
    window.history.pushState({}, '', targetPath);
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/' } }));
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
