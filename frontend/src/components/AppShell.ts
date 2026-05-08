/**
 * App Shell Component
 *
 * Material Design Lite layout with:
 * - Fixed header with navigation
 * - Responsive drawer (side navigation)
 * - Main content area
 */

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  active?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Route Planner', icon: 'map', path: '/' },
  { label: 'Trip Cost', icon: 'attach_money', path: '/cost' },
  { label: 'Refuel Stops', icon: 'local_gas_station', path: '/refuel' },
  { label: 'Export', icon: 'file_download', path: '/export' },
  { label: 'My Vehicles', icon: 'directions_car', path: '/vehicles' },
  { label: 'Route History', icon: 'history', path: '/history' },
];

export class AppShell {
  private container: HTMLElement;
  private contentArea: HTMLElement | null = null;
  private currentPath: string = '/';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.buildLayout();
    this.contentArea = this.container.querySelector('.app-content');
    this.bindEvents();

    // Upgrade MDL components after rendering
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
    }
  }

  getContentArea(): HTMLElement | null {
    return this.contentArea;
  }

  setActivePath(path: string): void {
    this.currentPath = path;
    this.updateActiveNav();
  }

  private buildLayout(): string {
    return `
      <div class="mdl-layout mdl-js-layout mdl-layout--fixed-header mdl-layout--fixed-drawer">
        ${this.buildHeader()}
        ${this.buildDrawer()}
        <main class="mdl-layout__content">
          <div class="app-content page-content"></div>
        </main>
      </div>
    `;
  }

  private buildHeader(): string {
    return `
      <header class="mdl-layout__header">
        <div class="mdl-layout__header-row">
          <span class="mdl-layout-title">Route Planner</span>
          <div class="mdl-layout-spacer"></div>
          <nav class="mdl-navigation mdl-layout--large-screen-only">
            <a class="mdl-navigation__link" href="/profile" data-nav="/profile">
              <i class="material-icons">account_circle</i>
            </a>
          </nav>
        </div>
      </header>
    `;
  }

  private buildDrawer(): string {
    const navLinks = NAV_ITEMS.map(
      (item) => `
        <a class="mdl-navigation__link${item.path === this.currentPath ? ' is-active' : ''}"
           href="${item.path}"
           data-nav="${item.path}">
          <i class="material-icons nav-icon">${item.icon}</i>
          ${item.label}
        </a>
      `
    ).join('');

    return `
      <div class="mdl-layout__drawer">
        <span class="mdl-layout-title">Route Planner</span>
        <nav class="mdl-navigation">
          ${navLinks}
        </nav>
      </div>
    `;
  }

  private bindEvents(): void {
    // Handle navigation link clicks (SPA routing)
    this.container.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const link = target.closest('[data-nav]') as HTMLElement | null;
      if (link) {
        e.preventDefault();
        const path = link.getAttribute('data-nav');
        if (path) {
          this.navigate(path);
        }
      }
    });
  }

  private navigate(path: string): void {
    this.currentPath = path;
    window.history.pushState({}, '', path);
    this.updateActiveNav();
    this.closeDrawer();

    // Dispatch custom navigation event for the app to handle
    window.dispatchEvent(
      new CustomEvent('app:navigate', { detail: { path } })
    );
  }

  private updateActiveNav(): void {
    const links = this.container.querySelectorAll('[data-nav]');
    links.forEach((link) => {
      const linkPath = link.getAttribute('data-nav');
      if (linkPath === this.currentPath) {
        link.classList.add('is-active');
      } else {
        link.classList.remove('is-active');
      }
    });
  }

  private closeDrawer(): void {
    const drawer = this.container.querySelector('.mdl-layout__drawer');
    const obfuscator = document.querySelector('.mdl-layout__obfuscator');
    if (drawer) {
      drawer.classList.remove('is-visible');
    }
    if (obfuscator) {
      obfuscator.classList.remove('is-visible');
    }
  }
}
