/**
 * VehicleListComponent — Flat grid component for displaying and selecting vehicle profiles.
 *
 * Replaces the dropdown-based VehicleSelector with a card-based grid layout.
 * Each card shows: vehicle name, vehicle_type icon/badge, and default indicator.
 * Shows a "Create a vehicle" prompt when no profiles exist.
 */

export interface VehicleProfileResponse {
  id: string;
  name: string;
  vehicle_type: 'motorcycle' | 'car' | 'camper' | 'ev';
  fuel_type: string | null;
  tank_capacity_liters: number | null;
  consumption_per_100km: number | null;
  battery_capacity_kwh: number | null;
  consumption_kwh_per_100km: number | null;
  charge_port_type: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleListOptions {
  container: HTMLElement;
  onSelect: (vehicleId: string) => void;
}

/** Maps vehicle_type to a display icon/emoji and label */
const VEHICLE_TYPE_DISPLAY: Record<string, { icon: string; label: string }> = {
  car: { icon: 'directions_car', label: 'Car' },
  motorcycle: { icon: 'two_wheeler', label: 'Motorcycle' },
  camper: { icon: 'rv_hookup', label: 'Camper' },
  ev: { icon: 'electric_car', label: 'EV ⚡' },
};

export class VehicleListComponent {
  private container: HTMLElement;
  private onSelect: (vehicleId: string) => void;
  private profiles: VehicleProfileResponse[] = [];
  private selectedId: string | null = null;

  /** Escapes HTML special characters to prevent XSS and rendering issues */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  constructor(options: VehicleListOptions) {
    this.container = options.container;
    this.onSelect = options.onSelect;
  }

  render(): void {
    if (this.profiles.length === 0) {
      this.renderEmpty();
      return;
    }

    this.renderGrid();
  }

  setProfiles(profiles: VehicleProfileResponse[]): void {
    this.profiles = profiles;

    // Auto-select the default vehicle if nothing is selected
    if (this.selectedId === null) {
      const defaultProfile = profiles.find((p) => p.is_default);
      if (defaultProfile) {
        this.selectedId = defaultProfile.id;
      }
    }

    this.render();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  destroy(): void {
    this.container.innerHTML = '';
  }

  // ─── Private Rendering ────────────────────────────────────────────────────

  private renderEmpty(): void {
    this.container.innerHTML = `
      <div class="vehicle-list vehicle-list--empty">
        <div class="vehicle-list__empty-state">
          <span class="material-symbols-rounded vehicle-list__empty-icon">directions_car</span>
          <p class="vehicle-list__empty-text">No vehicles yet.</p>
          <a href="/vehicles" class="btn btn--primary btn--lg vehicle-list__create-link" data-nav="/vehicles">
            <span class="material-symbols-rounded">add</span>
            Create a vehicle
          </a>
        </div>
      </div>
    `;
  }

  private renderGrid(): void {
    const cards = this.profiles.map((profile) => this.renderCard(profile)).join('');

    this.container.innerHTML = `
      <div class="vehicle-list">
        <div class="vehicle-list__grid">
          ${cards}
        </div>
      </div>
    `;

    // Attach click handlers
    const cardElements = this.container.querySelectorAll('.vehicle-list__card');
    cardElements.forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const vehicleId = (cardEl as HTMLElement).dataset.vehicleId;
        if (vehicleId) {
          this.selectedId = vehicleId;
          this.onSelect(vehicleId);
          this.updateSelection();
        }
      });
    });
  }

  private renderCard(profile: VehicleProfileResponse): string {
    const typeDisplay = VEHICLE_TYPE_DISPLAY[profile.vehicle_type] || {
      icon: 'directions_car',
      label: profile.vehicle_type,
    };
    const isSelected = profile.id === this.selectedId;
    const selectedClass = isSelected ? ' vehicle-list__card--selected' : '';

    const defaultBadge = profile.is_default
      ? `<span class="vehicle-list__default-badge" title="Default vehicle">
           <span class="material-symbols-rounded">star</span>
         </span>`
      : '';

    const escapedName = this.escapeHtml(profile.name);

    return `
      <div class="vehicle-list__card${selectedClass}" data-vehicle-id="${profile.id}" role="button" tabindex="0" aria-label="Select ${escapedName}">
        <div class="vehicle-list__card-header">
          <span class="vehicle-list__type-badge vehicle-list__type-badge--${profile.vehicle_type}">
            <span class="material-symbols-rounded">${typeDisplay.icon}</span>
            <span class="vehicle-list__type-label">${typeDisplay.label}</span>
          </span>
          ${defaultBadge}
        </div>
        <div class="vehicle-list__card-body">
          <span class="vehicle-list__vehicle-name">${escapedName}</span>
        </div>
      </div>
    `;
  }

  private updateSelection(): void {
    const cards = this.container.querySelectorAll('.vehicle-list__card');
    cards.forEach((cardEl) => {
      const vehicleId = (cardEl as HTMLElement).dataset.vehicleId;
      if (vehicleId === this.selectedId) {
        cardEl.classList.add('vehicle-list__card--selected');
      } else {
        cardEl.classList.remove('vehicle-list__card--selected');
      }
    });
  }
}
