/**
 * Start Planning Page — Modern wizard
 */

type VehicleType = 'car' | 'motorcycle' | 'camper' | 'ev';

interface WizardState {
  step: 1 | 2 | 3;
  vehicleType: VehicleType | null;
  destination: string;
  startDate: string;
  startTime: string;
  placeId: string;
  lat: number;
  lng: number;
}

export class StartPlanningPage {
  private container: HTMLElement;
  private state: WizardState = { step: 1, vehicleType: null, destination: '', startDate: '', startTime: '', placeId: '', lat: 0, lng: 0 };

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
      { type: 'ev', icon: 'electric_car', name: 'EV ⚡', desc: 'Electric vehicles with charging stops' },
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
    const now = new Date().toTimeString().slice(0, 5);
    return `
      <h2 class="wizard__title">Where are you headed?</h2>
      <p class="wizard__subtitle">Enter your first destination and departure date/time.</p>
      <form id="wizard-form" class="wizard__form">
        <div class="input-group">
          <label class="input-group__label" for="dest-input">Destination</label>
          <input class="input input--lg" type="text" id="dest-input"
                 placeholder="Start typing a city or address..." value="${this.state.destination}" required
                 autocomplete="off" />
          <div id="autocomplete-results" style="display:none;position:absolute;z-index:100;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);max-height:200px;overflow-y:auto;width:100%;margin-top:2px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="input-group">
            <label class="input-group__label" for="date-input">Departure date</label>
            <input class="input input--lg" type="date" id="date-input"
                   min="${today}" value="${this.state.startDate || today}" required />
          </div>
          <div class="input-group">
            <label class="input-group__label" for="time-input">Departure time</label>
            <input class="input input--lg" type="time" id="time-input"
                   value="${this.state.startTime || now}" />
          </div>
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-1);">
          Time is used for traffic-aware routing. Defaults to now if not set.
        </p>
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
      const time = (this.container.querySelector('#time-input') as HTMLInputElement)?.value || '';
      if (!dest || !date) return;
      this.state.destination = dest;
      this.state.startDate = date;
      this.state.startTime = time;

      // Build departure_time as Unix timestamp for traffic-aware routing
      const departureDate = new Date(`${date}T${time || '00:00'}`);
      const departureTime = Math.floor(departureDate.getTime() / 1000);

      const params = new URLSearchParams({
        vehicle: this.state.vehicleType || 'car',
        destination: dest,
        date,
        time,
        departure_time: departureTime.toString(),
        ...(this.state.placeId ? { place_id: this.state.placeId } : {}),
        ...(this.state.lat ? { lat: this.state.lat.toString(), lng: this.state.lng.toString() } : {}),
      });
      window.history.pushState({}, '', `/?${params}`);
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: '/' } }));
    });

    // Set up Places Autocomplete if Google Maps is available
    this.setupAutocomplete();
  }

  private goTo(step: 1 | 2 | 3): void {
    this.state.step = step;
    this.rerender();
  }

  private setupAutocomplete(): void {
    const input = this.container.querySelector('#dest-input') as HTMLInputElement;
    if (!input) return;

    // Check if Google Maps Places API is available
    if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(input, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: ['at','be','bg','hr','cz','dk','ee','fi','fr','de','gr','hu','ie','it','lv','lt','lu','nl','pl','pt','ro','sk','si','es','se','ch','no','gb'] },
        fields: ['place_id', 'geometry', 'formatted_address', 'name'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place?.geometry?.location) {
          this.state.destination = place.formatted_address || place.name || input.value;
          this.state.placeId = place.place_id || '';
          this.state.lat = place.geometry.location.lat();
          this.state.lng = place.geometry.location.lng();
          input.value = this.state.destination;
        }
      });
    } else {
      // Fallback: use our backend autocomplete API
      let debounceTimer: ReturnType<typeof setTimeout>;
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        if (query.length < 3) {
          this.hideAutocomplete();
          return;
        }
        debounceTimer = setTimeout(() => this.fetchAutocomplete(query), 300);
      });
    }
  }

  private async fetchAutocomplete(query: string): Promise<void> {
    try {
      const res = await fetch(`/api/v1/places/autocomplete?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      const suggestions = json.data?.suggestions || [];
      this.showAutocomplete(suggestions);
    } catch {
      this.hideAutocomplete();
    }
  }

  private showAutocomplete(suggestions: Array<{ placeId: string; description: string }>): void {
    const container = this.container.querySelector('#autocomplete-results') as HTMLElement;
    if (!container || suggestions.length === 0) { this.hideAutocomplete(); return; }

    container.style.display = 'block';
    container.innerHTML = suggestions.map(s => `
      <div class="autocomplete-item" data-place-id="${s.placeId}" data-desc="${s.description}"
           style="padding:var(--space-2) var(--space-3);cursor:pointer;font-size:var(--font-size-sm);border-bottom:1px solid var(--color-border-light);">
        ${s.description}
      </div>
    `).join('');

    container.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        const desc = (item as HTMLElement).dataset.desc || '';
        const placeId = (item as HTMLElement).dataset.placeId || '';
        this.state.destination = desc;
        this.state.placeId = placeId;
        const input = this.container.querySelector('#dest-input') as HTMLInputElement;
        if (input) input.value = desc;
        this.hideAutocomplete();
      });
      (item as HTMLElement).addEventListener('mouseenter', () => {
        (item as HTMLElement).style.background = 'var(--color-surface-hover)';
      });
      (item as HTMLElement).addEventListener('mouseleave', () => {
        (item as HTMLElement).style.background = '';
      });
    });
  }

  private hideAutocomplete(): void {
    const container = this.container.querySelector('#autocomplete-results') as HTMLElement;
    if (container) container.style.display = 'none';
  }

  private rerender(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
  }
}
