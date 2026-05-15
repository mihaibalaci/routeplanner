/**
 * My Vehicles Page — CRUD management with catalog-based dropdowns.
 */
import { apiClient } from '../api/client';

interface VehicleProfile {
  id: string;
  name: string;
  vehicle_type: string;
  fuel_type: string | null;
  tank_capacity_liters: number | null;
  consumption_per_100km: number | null;
  battery_capacity_kwh: number | null;
  consumption_kwh_per_100km: number | null;
  charge_port_type: string | null;
  is_default: boolean;
}

interface CatalogEntry {
  brand: string;
  model: string;
  fuel_type: string;
  avg_consumption: number | null;
  battery_capacity_kwh: number | null;
}

export class VehiclesPage {
  private container: HTMLElement;
  private vehicles: VehicleProfile[] = [];
  private catalog: CatalogEntry[] = [];
  private loading = true;
  private showForm = false;
  private editingId: string | null = null;
  private error: string | null = null;
  private success: string | null = null;
  private selectedType = 'car';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
    this.loadVehicles();
  }

  private build(): string {
    return `
      <div class="fade-up">
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h1 class="page-header__title">My Vehicles</h1>
            <p class="page-header__subtitle">Manage your vehicle profiles for route cost calculations.</p>
          </div>
          <button id="btn-add-vehicle" class="btn btn--primary">
            <span class="material-symbols-rounded">add</span> Add Vehicle
          </button>
        </div>

        ${this.error ? `<div class="alert alert--error" style="margin-bottom:var(--space-4);">${this.error}</div>` : ''}
        ${this.success ? `<div class="alert alert--success" style="margin-bottom:var(--space-4);background:var(--color-primary-50);color:var(--color-primary);border:1px solid var(--color-primary);border-radius:var(--radius-lg);padding:var(--space-3);">${this.success}</div>` : ''}

        <div id="vehicle-form-area" ${this.showForm ? '' : 'hidden'}></div>
        <div id="vehicles-list">
          ${this.loading ? '<div style="text-align:center;padding:var(--space-8);"><div class="cost-breakdown-panel__spinner"></div></div>' : this.buildVehiclesList()}
        </div>
      </div>
    `;
  }

  private buildVehiclesList(): string {
    if (this.vehicles.length === 0) {
      return `
        <div class="card">
          <div class="empty-state">
            <span class="material-symbols-rounded empty-state__icon">directions_car</span>
            <p class="empty-state__title">No vehicles yet</p>
            <p class="empty-state__text">Add a vehicle to start calculating route costs.</p>
          </div>
        </div>
      `;
    }

    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-4);">
      ${this.vehicles.map(v => this.buildVehicleCard(v)).join('')}
    </div>`;
  }

  private buildVehicleCard(v: VehicleProfile): string {
    const typeIcons: Record<string, string> = { car: 'directions_car', motorcycle: 'two_wheeler', camper: 'rv_hookup', ev: 'electric_car' };
    const icon = typeIcons[v.vehicle_type] || 'directions_car';
    const isEv = v.vehicle_type === 'ev';
    const consumption = isEv
      ? `${v.consumption_kwh_per_100km ?? '—'} kWh/100km`
      : `${v.consumption_per_100km ?? '—'} L/100km`;
    const fuelLabel = v.fuel_type ? v.fuel_type.replace('_', ' ') : '—';

    return `
      <div class="card" style="position:relative;">
        ${v.is_default ? '<span class="badge badge--success" style="position:absolute;top:var(--space-3);right:var(--space-3);">Default</span>' : ''}
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">
          <div style="width:40px;height:40px;border-radius:var(--radius-lg);background:var(--color-primary-50);display:flex;align-items:center;justify-content:center;">
            <span class="material-symbols-rounded" style="color:var(--color-primary);">${icon}</span>
          </div>
          <div>
            <div style="font-weight:600;">${v.name}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-secondary);">${v.vehicle_type.toUpperCase()}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);font-size:var(--font-size-sm);">
          <div><span style="color:var(--color-text-secondary);">Fuel:</span> ${fuelLabel}</div>
          <div><span style="color:var(--color-text-secondary);">Consumption:</span> ${consumption}</div>
          ${isEv ? `<div><span style="color:var(--color-text-secondary);">Battery:</span> ${v.battery_capacity_kwh ?? '—'} kWh</div>` : `<div><span style="color:var(--color-text-secondary);">Tank:</span> ${v.tank_capacity_liters ?? '—'} L</div>`}
          ${isEv && v.charge_port_type ? `<div><span style="color:var(--color-text-secondary);">Port:</span> ${v.charge_port_type}</div>` : ''}
        </div>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-4);">
          ${!v.is_default ? `<button class="btn btn--ghost btn--sm btn-set-default" data-id="${v.id}">Set Default</button>` : ''}
          <button class="btn btn--ghost btn--sm btn-edit" data-id="${v.id}">Edit</button>
          <button class="btn btn--ghost btn--sm btn-delete" data-id="${v.id}" style="color:var(--color-error);">Delete</button>
        </div>
      </div>
    `;
  }

  private buildForm(vehicle?: VehicleProfile): string {
    const isEdit = !!vehicle;
    const type = vehicle?.vehicle_type || this.selectedType;
    const isEv = type === 'ev';

    return `
      <div class="card" style="margin-bottom:var(--space-4);">
        <div class="card__title">${isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</div>
        <form id="vehicle-crud-form" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-top:var(--space-4);">
          <div class="input-group">
            <label class="input-group__label">Name</label>
            <input class="input" type="text" id="vf-name" value="${vehicle?.name || ''}" placeholder="My Car" required />
          </div>
          <div class="input-group">
            <label class="input-group__label">Type</label>
            <select class="input" id="vf-type">
              <option value="car" ${type === 'car' ? 'selected' : ''}>Car</option>
              <option value="motorcycle" ${type === 'motorcycle' ? 'selected' : ''}>Motorcycle</option>
              <option value="camper" ${type === 'camper' ? 'selected' : ''}>Camper</option>
              <option value="ev" ${type === 'ev' ? 'selected' : ''}>EV ⚡</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-group__label">Brand (from catalog)</label>
            <select class="input" id="vf-brand">
              <option value="">— Select brand —</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-group__label">Model (from catalog)</label>
            <select class="input" id="vf-model">
              <option value="">— Select model —</option>
            </select>
          </div>
          <div class="input-group ${isEv ? 'field-disabled' : ''}" id="vf-fuel-group">
            <label class="input-group__label">Fuel Type</label>
            <select class="input" id="vf-fuel" ${isEv ? 'disabled' : ''}>
              <option value="petrol_95" ${vehicle?.fuel_type === 'petrol_95' ? 'selected' : ''}>Gasoline 95</option>
              <option value="petrol_98" ${vehicle?.fuel_type === 'petrol_98' ? 'selected' : ''}>Gasoline 98</option>
              <option value="diesel" ${vehicle?.fuel_type === 'diesel' ? 'selected' : ''}>Diesel</option>
              <option value="lpg" ${vehicle?.fuel_type === 'lpg' ? 'selected' : ''}>LPG</option>
            </select>
          </div>
          <div class="input-group ${isEv ? 'field-disabled' : ''}" id="vf-tank-group">
            <label class="input-group__label">Tank Capacity (L)</label>
            <input class="input" type="number" id="vf-tank" min="5" max="200" step="0.1" value="${vehicle?.tank_capacity_liters || ''}" placeholder="60" ${isEv ? 'disabled' : ''} />
          </div>
          <div class="input-group ${!isEv ? 'field-disabled' : ''}" id="vf-battery-group">
            <label class="input-group__label">Battery Capacity (kWh)</label>
            <input class="input" type="number" id="vf-battery" min="10" max="200" step="0.1" value="${vehicle?.battery_capacity_kwh || ''}" placeholder="75" ${!isEv ? 'disabled' : ''} />
          </div>
          <div class="input-group ${!isEv ? 'field-disabled' : ''}" id="vf-port-group">
            <label class="input-group__label">Charge Port</label>
            <select class="input" id="vf-port" ${!isEv ? 'disabled' : ''}>
              <option value="Type2" ${vehicle?.charge_port_type === 'Type2' ? 'selected' : ''}>Type 2</option>
              <option value="CCS" ${vehicle?.charge_port_type === 'CCS' ? 'selected' : ''}>CCS</option>
              <option value="CHAdeMO" ${vehicle?.charge_port_type === 'CHAdeMO' ? 'selected' : ''}>CHAdeMO</option>
              <option value="Type1" ${vehicle?.charge_port_type === 'Type1' ? 'selected' : ''}>Type 1</option>
              <option value="Tesla" ${vehicle?.charge_port_type === 'Tesla' ? 'selected' : ''}>Tesla</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-group__label">${isEv ? 'Consumption (kWh/100km)' : 'Consumption (L/100km)'}</label>
            <input class="input" type="number" id="vf-consumption" min="1" max="50" step="0.1" value="${isEv ? (vehicle?.consumption_kwh_per_100km || '') : (vehicle?.consumption_per_100km || '')}" placeholder="${isEv ? '15' : '7.5'}" required />
          </div>
          <div style="grid-column:1/3;display:flex;gap:var(--space-2);">
            <button type="submit" class="btn btn--primary">${isEdit ? 'Update' : 'Save'}</button>
            <button type="button" id="btn-cancel-form" class="btn btn--ghost">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-add-vehicle')?.addEventListener('click', () => {
      this.editingId = null;
      this.showForm = true;
      this.showFormUI();
    });
  }

  private showFormUI(vehicle?: VehicleProfile): void {
    const area = this.container.querySelector('#vehicle-form-area') as HTMLElement;
    if (!area) return;
    area.hidden = false;
    area.innerHTML = this.buildForm(vehicle);
    this.bindFormEvents();
    this.loadCatalog();
  }

  private bindFormEvents(): void {
    this.container.querySelector('#vehicle-crud-form')?.addEventListener('submit', (e) => this.handleSubmit(e));
    this.container.querySelector('#btn-cancel-form')?.addEventListener('click', () => this.hideForm());
    this.container.querySelector('#vf-type')?.addEventListener('change', (e) => {
      this.selectedType = (e.target as HTMLSelectElement).value;
      this.showFormUI();
    });
    this.container.querySelector('#vf-brand')?.addEventListener('change', () => this.updateModelDropdown());
    this.container.querySelector('#vf-model')?.addEventListener('change', () => this.prefillFromCatalog());

    // Bind card action buttons
    this.container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleDelete((e.currentTarget as HTMLElement).dataset.id!));
    });
    this.container.querySelectorAll('.btn-set-default').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleSetDefault((e.currentTarget as HTMLElement).dataset.id!));
    });
    this.container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleEdit((e.currentTarget as HTMLElement).dataset.id!));
    });
  }

  private hideForm(): void {
    this.showForm = false;
    this.editingId = null;
    const area = this.container.querySelector('#vehicle-form-area') as HTMLElement;
    if (area) { area.hidden = true; area.innerHTML = ''; }
  }

  private async loadCatalog(): Promise<void> {
    try {
      const res = await apiClient.get<any>(`/vehicles/catalog?type=${this.selectedType}`);
      this.catalog = res.data?.data ?? [];
      this.updateBrandDropdown();
    } catch {
      this.catalog = [];
    }
  }

  private updateBrandDropdown(): void {
    const brandSelect = this.container.querySelector('#vf-brand') as HTMLSelectElement;
    if (!brandSelect) return;
    const brands = [...new Set(this.catalog.map(c => c.brand))].sort();
    brandSelect.innerHTML = '<option value="">— Select brand —</option>' +
      brands.map(b => `<option value="${b}">${b}</option>`).join('');
  }

  private updateModelDropdown(): void {
    const brand = (this.container.querySelector('#vf-brand') as HTMLSelectElement)?.value;
    const modelSelect = this.container.querySelector('#vf-model') as HTMLSelectElement;
    if (!modelSelect) return;
    const models = this.catalog.filter(c => c.brand === brand);
    modelSelect.innerHTML = '<option value="">— Select model —</option>' +
      models.map(m => `<option value="${m.model}">${m.model}</option>`).join('');
  }

  private prefillFromCatalog(): void {
    const brand = (this.container.querySelector('#vf-brand') as HTMLSelectElement)?.value;
    const model = (this.container.querySelector('#vf-model') as HTMLSelectElement)?.value;
    const entry = this.catalog.find(c => c.brand === brand && c.model === model);
    if (!entry) return;

    const nameInput = this.container.querySelector('#vf-name') as HTMLInputElement;
    if (nameInput && !nameInput.value) nameInput.value = `${brand} ${model}`;

    const consumptionInput = this.container.querySelector('#vf-consumption') as HTMLInputElement;
    if (consumptionInput && entry.avg_consumption) consumptionInput.value = String(entry.avg_consumption);

    const batteryInput = this.container.querySelector('#vf-battery') as HTMLInputElement;
    if (batteryInput && entry.battery_capacity_kwh) batteryInput.value = String(entry.battery_capacity_kwh);

    if (entry.fuel_type) {
      const fuelSelect = this.container.querySelector('#vf-fuel') as HTMLSelectElement;
      if (fuelSelect) fuelSelect.value = entry.fuel_type;
    }
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const isEv = this.selectedType === 'ev';
    const name = (this.container.querySelector('#vf-name') as HTMLInputElement).value.trim();
    const consumption = parseFloat((this.container.querySelector('#vf-consumption') as HTMLInputElement).value);

    if (!name) { this.error = 'Name is required'; this.rerender(); return; }

    const body: any = {
      name,
      vehicle_type: this.selectedType,
    };

    if (isEv) {
      body.battery_capacity_kwh = parseFloat((this.container.querySelector('#vf-battery') as HTMLInputElement)?.value || '0');
      body.consumption_kwh_per_100km = consumption;
      body.charge_port_type = (this.container.querySelector('#vf-port') as HTMLSelectElement)?.value || 'Type2';
    } else {
      body.fuel_type = (this.container.querySelector('#vf-fuel') as HTMLSelectElement).value;
      body.tank_capacity_liters = parseFloat((this.container.querySelector('#vf-tank') as HTMLInputElement)?.value || '60');
      body.consumption_per_100km = consumption;
    }

    try {
      if (this.editingId) {
        await apiClient.put<any>(`/vehicles/${this.editingId}`, body);
        this.success = 'Vehicle updated!';
      } else {
        await apiClient.post<any>('/vehicles', body);
        this.success = 'Vehicle created!';
      }
      this.error = null;
      this.showForm = false;
      this.editingId = null;
      this.rerender();
    } catch (err: any) {
      this.error = err.message || 'Failed to save vehicle';
      this.rerender();
    }
  }

  private async handleDelete(id: string): Promise<void> {
    if (!confirm('Delete this vehicle?')) return;
    try {
      await apiClient.delete<any>(`/vehicles/${id}`);
      this.success = 'Vehicle deleted';
      this.rerender();
    } catch (err: any) {
      this.error = err.message || 'Failed to delete';
      this.rerender();
    }
  }

  private async handleSetDefault(id: string): Promise<void> {
    try {
      await apiClient.put<any>(`/vehicles/${id}/default`, {});
      this.success = 'Default vehicle updated';
      this.rerender();
    } catch (err: any) {
      this.error = err.message || 'Failed to set default';
      this.rerender();
    }
  }

  private handleEdit(id: string): void {
    const vehicle = this.vehicles.find(v => v.id === id);
    if (!vehicle) return;
    this.editingId = id;
    this.selectedType = vehicle.vehicle_type;
    this.showForm = true;
    this.showFormUI(vehicle);
  }

  private async loadVehicles(): Promise<void> {
    if (!apiClient.isAuthenticated()) {
      this.loading = false;
      this.updateList();
      return;
    }
    try {
      const res = await apiClient.get<any>('/vehicles');
      const data = res.data?.data ?? res.data ?? [];
      this.vehicles = Array.isArray(data) ? data : [];
    } catch {
      this.vehicles = [];
    }
    this.loading = false;
    this.updateList();
  }

  private updateList(): void {
    const list = this.container.querySelector('#vehicles-list');
    if (list) list.innerHTML = this.buildVehiclesList();
    // Re-bind card buttons
    this.container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleDelete((e.currentTarget as HTMLElement).dataset.id!));
    });
    this.container.querySelectorAll('.btn-set-default').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleSetDefault((e.currentTarget as HTMLElement).dataset.id!));
    });
    this.container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleEdit((e.currentTarget as HTMLElement).dataset.id!));
    });
  }

  private rerender(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
    this.loadVehicles();
    if (this.success) setTimeout(() => { this.success = null; }, 3000);
  }
}
