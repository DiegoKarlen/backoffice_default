/**
 * 2026 Shell behaviors:
 *  - theme toggle (icon swap + persistence)
 *  - dropdown open/close
 *  - sidebar nav-group expand/collapse
 *  - hero date population
 *  - todo checkbox state
 *
 * The early-paint <script> in each page body sets the initial data-theme
 * attribute to avoid a flash; this module only handles runtime toggles.
 */

const STORE_KEY = 'dash26-theme';

const SUN_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function initThemeToggle() {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;

  const update = () => {
    toggle.innerHTML = root.getAttribute('data-theme') === 'dark' ? SUN_ICON : MOON_ICON;
  };
  update();

  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORE_KEY, next); } catch { /* localStorage may be unavailable */ }
    update();
  });
}

function initHeroDate() {
  const el = document.getElementById('heroDate');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date());
  const parts = fmt.replace(/,/g, '').split(' ');
  el.textContent = `${parts[0]} · ${parts[1]} ${parts[2]} · ${parts[3]}`;
}

function initNavGroups() {
  document.querySelectorAll('[data-nav-toggle]').forEach((a) => {
    a.addEventListener('click', () => {
      const group = a.closest('[data-nav-group]');
      if (group) group.classList.toggle('is-open');
    });
  });
}

/** Áreas del sidebar (Inicio, Administración): colapsar / expandir. */
function initNavSections() {
  document.querySelectorAll('[data-section-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('[data-nav-section]');
      if (!section) return;
      const next = !section.classList.contains('is-open');
      section.classList.toggle('is-open', next);
      btn.setAttribute('aria-expanded', next ? 'true' : 'false');
    });
  });
}

function initDropdowns() {
  const closeAll = (except) => {
    document.querySelectorAll('.dd-wrap.is-open').forEach((w) => {
      if (w !== except) w.classList.remove('is-open');
    });
  };

  document.querySelectorAll('[data-dropdown]').forEach((trigger) => {
    const wrap = trigger.closest('.dd-wrap');
    if (!wrap) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !wrap.classList.contains('is-open');
      closeAll(wrap);
      wrap.classList.toggle('is-open', willOpen);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dd-wrap')) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}

function initTodos() {
  document.querySelectorAll('.todo-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      const item = cb.closest('.todo-item');
      if (item) item.classList.toggle('is-done', cb.checked);
    });
  });
}

function initAccordions() {
  document.querySelectorAll('[data-accordion-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('[data-accordion]');
      if (item) item.classList.toggle('is-open');
    });
  });
}

function initTabGroups() {
  // Tabs that opt in by sharing a [data-tab-group] container.
  // Each .tab inside gets click → toggles is-active on siblings and
  // matches a sibling .tab-panel by data-tab-target.
  document.querySelectorAll('[data-tab-group]').forEach((group) => {
    const tabs = group.querySelectorAll('.tab');
    const panels = group.querySelectorAll('.tab-panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.getAttribute('data-tab-target');
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-tab-id') === target));
      });
    });
  });
}

/** Prefetch de HTML del menú al pasar el ratón (siguiente clic más fluido). */
function initSidebarPrefetch() {
  const prefetched = new Set();
  document.addEventListener(
    "mouseover",
    (e) => {
      const a = e.target?.closest?.(".d-sidebar a[href]");
      if (!a || !a.href) return;
      try {
        const u = new URL(a.href, window.location.origin);
        if (u.origin !== window.location.origin) return;
        if (!u.pathname.endsWith(".html")) return;
        const key = u.pathname + u.search;
        if (prefetched.has(key)) return;
        prefetched.add(key);
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = u.pathname + u.search;
        document.head.appendChild(link);
      } catch {
        /* ignore */
      }
    },
    true,
  );
}

function initMobileDrawer() {
  // Narrow viewport: hamburger (visible at ≤1100px via CSS) opens off-canvas
  // sidebar drawer. Closes on backdrop click, Esc, or selecting a nav link.
  const body = document.body;
  if (!body) return;

  // Inject a backdrop element once (used by CSS via body.has-drawer-open).
  if (!document.querySelector('.drawer-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    body.appendChild(backdrop);
    backdrop.addEventListener('click', closeDrawer);
  }

  function openDrawer() {
    body.classList.add('has-drawer-open');
  }
  function closeDrawer() {
    body.classList.remove('has-drawer-open');
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-drawer-open]');
    if (trigger) { e.preventDefault(); openDrawer(); return; }
    // Auto-close when a sidebar nav link is selected (so the next page opens cleanly).
    const linkInDrawer = e.target.closest('.d-sidebar a[href]:not([href^="#"]):not([href="javascript:void(0)"])');
    if (body.classList.contains('has-drawer-open') && linkInDrawer) {
      closeDrawer();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && body.classList.contains('has-drawer-open')) closeDrawer();
  });
}

export function initShellBehaviors() {
  initThemeToggle();
  initHeroDate();
  initNavSections();
  initNavGroups();
  initSidebarPrefetch();
  initDropdowns();
  initTodos();
  initAccordions();
  initTabGroups();
  initMobileDrawer();
}
