import { AppShell } from './components/AppShell';
import { apiClient } from './api/client';
import { RoutePlannerPage } from './pages/RoutePlannerPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { TripCostPage } from './pages/TripCostPage';
import { VignetteCostPage } from './pages/VignetteCostPage';
import { RefuelAdvisorPage } from './pages/RefuelAdvisorPage';
import { ExportPage } from './pages/ExportPage';
import { HistoryPage } from './pages/HistoryPage';
import { FuelCalculatorPage } from './pages/FuelCalculatorPage';
import { StartPlanningPage } from './pages/StartPlanningPage';

// Declare MDL's componentHandler on window
declare global {
  // eslint-disable-next-line no-var
  var componentHandler: {
    upgradeDom(): void;
    upgradeElement(element: HTMLElement): void;
    downgradeElements(elements: HTMLElement | HTMLElement[]): void;
  };
}

class App {
  private shell: AppShell;

  constructor() {
    const appEl = document.getElementById('app');
    if (!appEl) throw new Error('Missing #app element');

    this.shell = new AppShell(appEl);
    this.shell.render();

    this.setupRouting();
    this.handleInitialRoute();
  }

  private setupRouting(): void {
    // Listen for SPA navigation events from AppShell
    window.addEventListener('app:navigate', ((e: CustomEvent<{ path: string }>) => {
      this.renderPage(e.detail.path);
    }) as EventListener);

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      const path = window.location.pathname;
      this.shell.setActivePath(path);
      this.renderPage(path);
    });
  }

  private handleInitialRoute(): void {
    let path = window.location.pathname;
    // Redirect root to /start (landing wizard) on fresh visits
    if (path === '/' && !window.location.search) {
      path = '/start';
      window.history.replaceState({}, '', path);
    }
    this.shell.setActivePath(path);
    this.renderPage(path);
  }

  private renderPage(path: string): void {
    const content = this.shell.getContentArea();
    if (!content) return;

    // Check authentication for protected routes
    if (path !== '/login' && path !== '/register' && path !== '/calculator' && path !== '/start' && !apiClient.isAuthenticated()) {
      new LoginPage(content).render();
      return;
    }

    switch (path) {
      case '/':
        content.innerHTML = '';
        new RoutePlannerPage(content).render();
        break;
      case '/start':
        content.innerHTML = '';
        new StartPlanningPage(content).render();
        break;
      case '/cost':
        content.innerHTML = '';
        new TripCostPage(content).render();
        break;
      case '/vignettes':
        content.innerHTML = '';
        new VignetteCostPage(content).render();
        break;
      case '/refuel':
        content.innerHTML = '';
        new RefuelAdvisorPage(content).render();
        break;
      case '/export':
        content.innerHTML = '';
        new ExportPage(content).render();
        break;
      case '/vehicles':
        content.innerHTML = '';
        new TripCostPage(content).render();
        break;
      case '/history':
        content.innerHTML = '';
        new HistoryPage(content).render();
        break;
      case '/calculator':
        content.innerHTML = '';
        new FuelCalculatorPage(content).render();
        break;
      case '/login':
        new LoginPage(content).render();
        break;
      case '/register':
        new RegisterPage(content).render();
        break;
      default:
        content.innerHTML = this.renderNotFound();
    }

    this.upgradeComponents(content);
  }

  private upgradeComponents(container: HTMLElement): void {
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
    }
    // Suppress unused variable warning
    void container;
  }

  // --- Page Placeholders ---

  private renderNotFound(): string {
    return `
      <div class="mdl-card mdl-shadow--2dp app-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">Page Not Found</h2>
        </div>
        <div class="mdl-card__supporting-text">
          <p>The page you're looking for doesn't exist.</p>
        </div>
        <div class="mdl-card__actions mdl-card--border">
          <a class="mdl-button mdl-button--colored mdl-js-button"
             href="/" data-nav="/">
            Go to Route Planner
          </a>
        </div>
      </div>
    `;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
