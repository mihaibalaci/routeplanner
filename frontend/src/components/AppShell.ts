/**
 * App Shell — Modern sidebar layout
 */

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Start Planning', icon: 'explore', path: '/start', section: 'Plan' },
  { label: 'Route Planner', icon: 'map', path: '/', section: 'Plan' },
  { label: 'Fuel Calculator', icon: 'calculate', path: '/calculator', section: 'Tools' },
  { label: 'Trip Cost', icon: 'payments', path: '/cost', section: 'Tools' },
  { label: 'Refuel Stops', icon: 'local_gas_station', path: '/refuel', section: 'Tools' },
  { label: 'Export', icon: 'download', path: '/export', section: 'Tools' },
  { label: 'My Vehicles', icon: 'directions_car', path: '/vehicles', section: 'Account' },
  { label: 'Route History', icon: 'history', path: '/history', section: 'Account' },
];

export class AppShell {
  private container: HTMLElement;
  private contentArea: HTMLElement | null = null;
  private currentPath: string = '/start';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.buildLayout();
    this.contentArea = this.container.querySelector('.main-content__inner');
    this.bindEvents();
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
      <div class="app-layout">
        ${this.buildSidebar()}
        <main class="main-content">
          <div class="main-content__inner"></div>
        </main>
      </div>
    `;
  }

  private buildSidebar(): string {
    // Group nav items by section
    const sections = new Map<string, NavItem[]>();
    for (const item of NAV_ITEMS) {
      const section = item.section || 'General';
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section)!.push(item);
    }

    let navHtml = '';
    for (const [section, items] of sections) {
      navHtml += `<div class="sidebar__section-label">${section}</div>`;
      navHtml += items.map(item => `
        <a class="nav-item ${item.path === this.currentPath ? 'is-active' : ''}"
           href="${item.path}" data-nav="${item.path}">
          <span class="material-symbols-rounded nav-item__icon">${item.icon}</span>
          ${item.label}
        </a>
      `).join('');
    }

    return `
      <aside class="sidebar">
        <div class="sidebar__brand">
          <div class="sidebar__brand-icon">
            <span class="material-symbols-rounded" style="font-size:18px;">route</span>
          </div>
          <span class="sidebar__brand-text">Route Planner</span>
        </div>
        <nav class="sidebar__nav">
          ${navHtml}
        </nav>
      </aside>
    `;
  }

  private bindEvents(): void {
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
    window.dispatchEvent(
      new CustomEvent('app:navigate', { detail: { path } })
    );
  }

  private updateActiveNav(): void {
    const links = this.container.querySelectorAll('[data-nav]');
    links.forEach((link) => {
      const linkPath = link.getAttribute('data-nav');
      link.classList.toggle('is-active', linkPath === this.currentPath);
    });
  }
}
