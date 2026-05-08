/**
 * Vignette Cost Page
 *
 * Displays vignette requirements and costs for a route:
 * - Show vignette requirements per country (from GET /vignettes/route/:routeId)
 * - Display motorcycle exemption indicator for RO/BG
 * - Duration selector dropdown per country
 * - Per-country vignette cost based on selected duration
 * - Total vignette cost and combined total (fuel + vignettes)
 * - Dynamic cost update when duration selection changes
 *
 * Requirements: 16.2, 16.3, 16.5, 16.6
 */

import { apiClient, ApiError } from '../api/client';

interface VignettePrice {
  countryCode: string;
  vehicleType: string;
  duration: string;
  priceEur: number;
  source: string;
  fetchedAt: string;
}

interface RouteVignetteRequirement {
  countryCode: string;
  countryName: string;
  required: boolean;
  motorcycleExempt: boolean;
  availableDurations: string[];
  prices: VignettePrice[];
}

interface VignetteCostEstimate {
  totalVignetteCostEur: number;
  countryBreakdown: {
    countryCode: string;
    countryName: string;
    selectedDuration: string;
    costEur: number;
  }[];
}

export class VignetteCostPage {
  private container: HTMLElement;
  private requirements: RouteVignetteRequirement[] = [];
  private durationSelections: Record<string, string> = {};
  private costEstimate: VignetteCostEstimate | null = null;
  private fuelCostEur: number | null = null;
  private loading = false;
  private error: string | null = null;
  private routeId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.routeId = sessionStorage.getItem('currentRouteId');
    const storedFuelCost = sessionStorage.getItem('lastFuelCostEur');
    if (storedFuelCost) {
      this.fuelCostEur = parseFloat(storedFuelCost);
    }
  }

  async render(): Promise<void> {
    this.container.innerHTML = this.buildLoading();
    this.upgradeComponents();

    if (!this.routeId) {
      this.error = 'No route selected. Please calculate a route first.';
      this.container.innerHTML = this.buildTemplate();
      return;
    }

    await this.loadRequirements();
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private async loadRequirements(): Promise<void> {
    this.loading = true;
    try {
      const res = await apiClient.get<RouteVignetteRequirement[]>(
        `/vignettes/route/${this.routeId}`
      );
      this.requirements = res.data;

      // Set default duration selections (shortest available)
      for (const req of this.requirements) {
        if (req.required && req.availableDurations.length > 0) {
          this.durationSelections[req.countryCode] = req.availableDurations[0];
        }
      }

      // Calculate initial cost
      await this.calculateCost();
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to load vignette requirements.';
    } finally {
      this.loading = false;
    }
  }

  private async calculateCost(): Promise<void> {
    if (!this.routeId) return;

    try {
      const durationParams = Object.entries(this.durationSelections)
        .map(([country, duration]) => `${country}:${duration}`)
        .join(',');

      const res = await apiClient.get<VignetteCostEstimate>(
        `/vignettes/route/${this.routeId}/cost`,
        durationParams ? { duration: durationParams } : undefined
      );
      this.costEstimate = res.data;
    } catch {
      // Cost calculation failed silently — display what we have
      this.costEstimate = null;
    }
  }

  private buildTemplate(): string {
    if (this.error) {
      return `
        <div class="vignette-cost-page">
          ${this.buildError()}
        </div>
      `;
    }

    if (this.loading) {
      return this.buildLoading();
    }

    return `
      <div class="vignette-cost-page">
        ${this.buildRequirementsCard()}
        ${this.costEstimate ? this.buildCostSummary() : ''}
      </div>
    `;
  }

  private buildRequirementsCard(): string {
    if (this.requirements.length === 0) {
      return `
        <div class="mdl-card mdl-shadow--2dp app-card">
          <div class="mdl-card__title">
            <h2 class="mdl-card__title-text">
              <i class="material-icons">toll</i>&nbsp;Vignette Requirements
            </h2>
          </div>
          <div class="mdl-card__supporting-text" style="text-align:center;padding:24px;">
            <p>No vignette requirements for this route. Your route does not cross any countries that require a vignette.</p>
          </div>
        </div>
      `;
    }

    const rows = this.requirements
      .map((req) => {
        if (!req.required) return '';

        const exemptBadge = req.motorcycleExempt
          ? `<span class="mdl-chip" style="background:#c8e6c9;margin-left:8px;">
               <span class="mdl-chip__text" style="font-size:11px;">🏍️ Motorcycle exempt</span>
             </span>`
          : '';

        const durationOptions = req.availableDurations
          .map(
            (d) =>
              `<option value="${d}" ${this.durationSelections[req.countryCode] === d ? 'selected' : ''}>${d}</option>`
          )
          .join('');

        const selectedPrice = req.prices.find(
          (p) => p.duration === this.durationSelections[req.countryCode]
        );
        const priceDisplay = selectedPrice ? `€${selectedPrice.priceEur.toFixed(2)}` : '—';

        return `
          <tr>
            <td class="mdl-data-table__cell--non-numeric">
              ${req.countryName} (${req.countryCode})${exemptBadge}
            </td>
            <td>
              <select class="duration-select" data-country="${req.countryCode}"
                      style="padding:4px 8px;">
                ${durationOptions}
              </select>
            </td>
            <td>${priceDisplay}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="mdl-card mdl-shadow--2dp app-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">toll</i>&nbsp;Vignette Requirements
          </h2>
        </div>
        <div class="mdl-card__supporting-text">
          <table class="mdl-data-table mdl-js-data-table" style="width:100%;">
            <thead>
              <tr>
                <th class="mdl-data-table__cell--non-numeric">Country</th>
                <th>Duration</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private buildCostSummary(): string {
    if (!this.costEstimate) return '';

    const totalVignette = this.costEstimate.totalVignetteCostEur;
    const combinedTotal =
      this.fuelCostEur !== null ? this.fuelCostEur + totalVignette : null;

    return `
      <div class="mdl-card mdl-shadow--2dp app-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">summarize</i>&nbsp;Cost Summary
          </h2>
        </div>
        <div class="mdl-card__supporting-text">
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;">
              <span>Total Vignette Cost:</span>
              <strong>€${totalVignette.toFixed(2)}</strong>
            </div>
            ${this.fuelCostEur !== null ? `
            <div style="display:flex;justify-content:space-between;">
              <span>Fuel Cost:</span>
              <span>€${this.fuelCostEur.toFixed(2)}</span>
            </div>
            <hr style="margin:4px 0;" />
            <div style="display:flex;justify-content:space-between;font-size:1.1em;">
              <strong>Combined Total:</strong>
              <strong>€${combinedTotal!.toFixed(2)}</strong>
            </div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private buildError(): string {
    return `
      <div class="mdl-card mdl-shadow--2dp app-card" style="background:#f8d7da;">
        <div class="mdl-card__supporting-text" style="color:#721c24;">
          <i class="material-icons" style="vertical-align:middle;">error</i>
          ${this.error}
        </div>
      </div>
    `;
  }

  private buildLoading(): string {
    return `
      <div style="text-align:center;padding:32px;">
        <div class="mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active"></div>
        <p>Loading vignette data...</p>
      </div>
    `;
  }

  private bindEvents(): void {
    const selects = this.container.querySelectorAll('.duration-select');
    selects.forEach((sel) => {
      sel.addEventListener('change', async (e) => {
        const target = e.target as HTMLSelectElement;
        const country = target.dataset.country!;
        this.durationSelections[country] = target.value;
        await this.calculateCost();
        this.container.innerHTML = this.buildTemplate();
        this.bindEvents();
        this.upgradeComponents();
      });
    });
  }

  private upgradeComponents(): void {
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
    }
  }
}
