/**
 * History Page — Modern design
 */

export class HistoryPage {
  private container: HTMLElement;

  constructor(container: HTMLElement) { this.container = container; }

  render(): void {
    this.container.innerHTML = `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Route History</h1>
          <p class="page-header__subtitle">Your saved routes, sorted by most recent.</p>
        </div>
        <div class="card">
          <div class="empty-state">
            <span class="material-symbols-rounded empty-state__icon">history</span>
            <p class="empty-state__title">No saved routes yet</p>
            <p class="empty-state__text">Plan and finalize a route to see it here.</p>
            <a href="/start" data-nav="/start" class="btn btn--primary" style="margin-top:var(--space-4);">
              <span class="material-symbols-rounded">explore</span> Start Planning
            </a>
          </div>
        </div>
      </div>
    `;
  }
}
