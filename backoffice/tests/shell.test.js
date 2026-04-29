import { describe, it, expect, beforeEach } from 'vitest';
import { mountShell, NAV } from '../src/assets/scripts/2026/Shell.js';

function setupShellDom({ active = '', dataBoPage = 'home' } = {}) {
  document.body.setAttribute('data-active', active);
  document.body.setAttribute('data-bo-page', dataBoPage);
  document.body.innerHTML = `
    <div class="shell">
      <div data-shell-sidebar></div>
      <div class="main">
        <div data-shell-topbar></div>
        <main class="content"></main>
        <div data-shell-footer></div>
      </div>
    </div>
  `;
}

describe('Shell', () => {
  describe('NAV manifest', () => {
    it('exports a non-empty NAV array', () => {
      expect(Array.isArray(NAV)).toBe(true);
      expect(NAV.length).toBeGreaterThan(0);
    });

    it('every section has a labelKey and a non-empty items array', () => {
      for (const section of NAV) {
        expect(typeof section.labelKey).toBe('string');
        expect(Array.isArray(section.items)).toBe(true);
        expect(section.items.length).toBeGreaterThan(0);
      }
    });

    it('every leaf item has key + textKey + (href OR children)', () => {
      const visit = (item) => {
        expect(typeof item.key).toBe('string');
        expect(typeof item.textKey).toBe('string');
        if (item.children) {
          expect(Array.isArray(item.children)).toBe(true);
          item.children.forEach(visit);
        } else {
          expect(typeof item.href).toBe('string');
        }
      };
      NAV.forEach((s) => s.items.forEach(visit));
    });

    it('all keys are unique across the entire NAV', () => {
      const keys = [];
      const collect = (item) => {
        keys.push(item.key);
        if (item.children) item.children.forEach(collect);
      };
      NAV.forEach((s) => s.items.forEach(collect));
      const set = new Set(keys);
      expect(set.size).toBe(keys.length);
    });

    it('internal links are relative HTML files, not external docs URLs', () => {
      const allHrefs = [];
      NAV.forEach((s) =>
        s.items.forEach((i) => {
          if (i.href) allHrefs.push(i.href);
          if (i.children) i.children.forEach((c) => c.href && allHrefs.push(c.href));
        }),
      );
      for (const h of allHrefs) {
        expect(h).not.toContain('puikinsh.github.io');
      }
    });
  });

  describe('mountShell()', () => {
    it('renders sidebar/topbar/footer into the placeholders', () => {
      setupShellDom({ active: 'home', dataBoPage: 'home' });
      mountShell();
      expect(document.querySelector('.d-sidebar')).toBeTruthy();
      expect(document.querySelector('.d-topbar')).toBeTruthy();
      expect(document.querySelector('.d-footer')).toBeTruthy();
    });

    it('marks the matching nav item as active', () => {
      setupShellDom({ active: 'home', dataBoPage: 'home' });
      mountShell();
      const activeLinks = document.querySelectorAll('.nav-link.is-active');
      expect(activeLinks.length).toBe(1);
      expect(activeLinks[0].textContent).toMatch(/Home|Inicio/);
    });

    it('renders breadcrumbs from locale via data-bo-page', () => {
      setupShellDom({ active: 'admin-users', dataBoPage: 'users' });
      mountShell();
      const crumbs = document.querySelector('.crumbs');
      expect(crumbs.textContent).toMatch(/Administration|Administración/);
      expect(crumbs.textContent).toMatch(/Users|Usuarios/);
      const current = document.querySelector('.crumbs .current');
      expect(current).toBeTruthy();
    });

    it('includes the hamburger button in the topbar (for mobile drawer)', () => {
      setupShellDom({ active: 'home', dataBoPage: 'home' });
      mountShell();
      const burger = document.querySelector('.hamburger[data-drawer-open]');
      expect(burger).toBeTruthy();
    });

    it('includes language selector in the topbar', () => {
      setupShellDom({ active: 'home', dataBoPage: 'home' });
      mountShell();
      expect(document.querySelector('#bo-lang-wrap')).toBeTruthy();
      expect(document.querySelector('.bo-lang-btn')).toBeTruthy();
    });

    it('silently no-ops when placeholders are missing (standalone pages)', () => {
      document.body.innerHTML = '<div>standalone</div>';
      expect(() => mountShell()).not.toThrow();
      expect(document.querySelector('.d-sidebar')).toBeFalsy();
    });
  });
});
