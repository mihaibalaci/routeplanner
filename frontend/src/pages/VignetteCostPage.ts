/**
 * Vignette Cost Page — Modern design
 */
export class VignetteCostPage {
  private container: HTMLElement;
  constructor(container: HTMLElement) { this.container = container; }

  render(): void {
    this.container.innerHTML = `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Vignette Costs</h1>
          <p class="page-header__subtitle">See which countries on your route require a vignette and how much they cost.</p>
        </div>
        <div class="card">
          <div class="empty-state">
            <span class="material-symbols-rounded empty-state__icon">toll</span>
            <p class="empty-state__title">No route calculated</p>
            <p class="empty-state__text">Calculate a route first to see vignette requirements.</p>
          </div>
        </div>
      </div>
    `;
  }
}
