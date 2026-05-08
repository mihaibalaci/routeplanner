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
import './styles/main.css';

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
    window.addEventListener('app:navigate', ((e: CustomEvent<{ path: string }>) => {
      this.renderPage(e.detail.path);
    }) as EventListener);

    window.addEventListener('popstate', () => {
      const path = window.location.pathname;
      this.shell.setActivePath(path);
      this.renderPage(path);
    });
  }

  private handleInitialRoute(): void {
    let path = window.location.pathname;
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

    // Public routes (no auth required)
    const publicRoutes = ['/login', '/register', '/calculator', '/start'];
    if (!publicRoutes.includes(path) && !apiClient.isAuthenticated()) {
      new LoginPage(content).render();
      return;
    }

    content.innerHTML = '';

    switch (path) {
      case '/':
        new RoutePlannerPage(content).render();
        break;
      case '/start':
        new StartPlanningPage(content).render();
        break;
      case '/cost':
      case '/vehicles':
        new TripCostPage(content).render();
        break;
      case '/vignettes':
        new VignetteCostPage(content).render();
        break;
      case '/refuel':
        new RefuelAdvisorPage(content).render();
        break;
      case '/export':
        new ExportPage(content).render();
        break;
      case '/history':
        new HistoryPage(content).render();
        break;
      case '/calculator':
        new FuelCalculatorPage(content).render();
        break;
      case '/login':
        new LoginPage(content).render();
        break;
      case '/register':
        new RegisterPage(content).render();
        break;
      default:
        content.innerHTML = `
          <div class="empty-state" style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <span class="material-symbols-rounded empty-state__icon">error</span>
            <p class="empty-state__title">Page Not Found</p>
            <a href="/start" data-nav="/start" class="btn btn--primary" style="margin-top:var(--space-4);">Go Home</a>
          </div>
        `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
