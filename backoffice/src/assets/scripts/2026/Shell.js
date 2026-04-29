/**
 * 2026 Shell renderer.
 *
 * NAV usa labelKey / textKey para i18n (bo-i18n). mountShell() resuelve migas con
 * crumbsStringForPage según data-bo-page.
 */

import { t, getLocale, AVAILABLE_LOCALES, crumbsStringForPage } from "./bo-i18n.js";

/** Menú por áreas — textos vía textKey en locales. */
export const NAV = [
  {
    labelKey: "nav.areas.start",
    items: [
      {
        key: "home",
        textKey: "nav.items.home",
        href: "index.html",
        icon:
          '<path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/>',
      },
    ],
  },
  {
    labelKey: "nav.areas.admin",
    items: [
      {
        key: "admin-users",
        textKey: "nav.items.users",
        href: "admin-users.html",
        func: "bo.users.manage",
        icon:
          '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      },
      {
        key: "admin-functionalities",
        textKey: "nav.items.functionalities",
        href: "admin-functionalities.html",
        func: "bo.functionalities.manage",
        icon:
          '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
      },
      {
        key: "admin-roles",
        textKey: "nav.items.roles",
        href: "admin-roles.html",
        func: "bo.roles.manage",
        icon:
          '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-3 4-5 8-5s8 2 8 5"/>',
      },
    ],
  },
];

const BRAND_LOGO = `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
  <path fill="#ffffff" d="M14.747 9.125c.527-1.426 1.736-2.573 3.317-2.573c1.643 0 2.792 1.085 3.318 2.573l6.077 16.867c.186.496.248.931.248 1.147c0 1.209-.992 2.046-2.139 2.046c-1.303 0-1.954-.682-2.264-1.611l-.931-2.915h-8.62l-.93 2.884c-.31.961-.961 1.642-2.232 1.642c-1.24 0-2.294-.93-2.294-2.17c0-.496.155-.868.217-1.023l6.233-16.867zm.34 11.256h5.891l-2.883-8.992h-.062l-2.946 8.992z"/>
</svg>`;

const CHEV =
  '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg>';

function renderNavLink(item, activeKey) {
  const active = item.key === activeKey ? " is-active" : "";
  const badge = item.badge
    ? `<span class="nav-badge ${item.badge.kind}">${item.badge.text}</span>`
    : "";
  const dataFunc = item.func ? ` data-bo-func="${item.func}"` : "";
  const label = t(item.textKey);
  return `
    <a class="nav-link${active}" href="${item.href}"${dataFunc}>
      <svg viewBox="0 0 24 24">${item.icon}</svg>
      <span>${label}</span>
      ${badge}
    </a>`;
}

function renderNavGroup(item, activeKey) {
  const open = item.children.some((c) => c.key === activeKey) ? " is-open" : "";
  const submenu = item.children
    .map((c) => `<a href="${c.href}">${c.text}</a>`)
    .join("");
  return `
    <div class="nav-item-group${open}" data-nav-group>
      <a class="nav-link" href="javascript:void(0)" data-nav-toggle>
        <svg viewBox="0 0 24 24">${item.icon}</svg>
        <span>${item.text}</span>
        ${CHEV}
      </a>
      <div class="nav-submenu">${submenu}</div>
    </div>`;
}

function renderSection(section, activeKey) {
  const items = section.items
    .map((item) =>
      item.children ? renderNavGroup(item, activeKey) : renderNavLink(item, activeKey),
    )
    .join("");
  return `
    <nav class="nav-section" data-nav-section>
      <button type="button" class="nav-section-toggle" data-section-toggle aria-expanded="false">
        <span class="nav-section-label">${t(section.labelKey)}</span>
        ${CHEV}
      </button>
      <div class="nav-section-body">
        ${items}
      </div>
    </nav>`;
}

function renderSidebar(activeKey) {
  const sections = NAV.map((s) => renderSection(s, activeKey)).join("");
  return `
    <aside class="d-sidebar">
      <div class="brand">
        <div class="brand-logo">${BRAND_LOGO}</div>
        <div class="brand-text">
          <div class="brand-name">${t("brand.name")}</div>
          <div class="brand-tag">${t("brand.tag")}</div>
        </div>
      </div>
      ${sections}
      <div class="sidebar-footer">
        <div class="workspace">
          <div class="workspace-avatar">JD</div>
          <div class="workspace-text">
            <div class="workspace-name">John Doe</div>
            <div class="workspace-role">admin</div>
          </div>
          <svg class="workspace-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="m7 9 5-5 5 5"/><path d="m7 15 5 5 5-5"/>
          </svg>
        </div>
      </div>
    </aside>`;
}

function renderCrumbs(crumbsAttr) {
  if (!crumbsAttr) return "";
  const parts = crumbsAttr.split("|").map((p) => p.trim()).filter(Boolean);
  const sep =
    '<svg class="sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>';
  return parts
    .map((p, i) => {
      const cls = i === parts.length - 1 ? ' class="current"' : "";
      return `${i > 0 ? sep : ""}<span${cls}>${p}</span>`;
    })
    .join("");
}

function renderLangMenu() {
  const current = getLocale();
  const buttons = AVAILABLE_LOCALES.map((code) => {
    const cur = code === current ? ' aria-current="true"' : "";
    return `<button type="button" class="dd-menu-item" data-bo-lang="${code}"${cur}>${t(`lang.${code}`)}</button>`;
  }).join("");
  return `
    <div class="dd-wrap" id="bo-lang-wrap">
      <button type="button" class="icon-btn bo-lang-btn" data-dropdown aria-label="${t("topbar.language")}" title="${t("topbar.language")}">
        <span class="bo-lang-code">${current.toUpperCase()}</span>
      </button>
      <div class="dd-menu" role="menu">
        ${buttons}
      </div>
    </div>`;
}

/**
 * Actualiza menú activo, migas y secciones abiertas (navegación SPA interna).
 */
export function updateShellRoute(activeKey, crumbsAttr) {
  document.querySelectorAll(".d-sidebar a.nav-link[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("javascript:") || href === "#") return;
    let keyMatch = "";
    for (const sec of NAV) {
      for (const it of sec.items) {
        if (it.children) continue;
        if (it.href === href || href.endsWith(it.href)) {
          keyMatch = it.key;
          break;
        }
      }
      if (keyMatch) break;
    }
    if (keyMatch) {
      a.classList.toggle("is-active", keyMatch === activeKey);
    }
  });

  const crumbsWrap = document.querySelector(".d-topbar .crumbs");
  if (crumbsWrap) {
    const hamburger = crumbsWrap.querySelector(".hamburger");
    const crumbsHtml = renderCrumbs(crumbsAttr || "");
    crumbsWrap.innerHTML = "";
    if (hamburger) crumbsWrap.appendChild(hamburger);
    crumbsWrap.insertAdjacentHTML("beforeend", crumbsHtml);
  }

  document.querySelectorAll("[data-nav-section]").forEach((sec) => {
    const hasActive = sec.querySelector(".nav-link.is-active");
    sec.classList.toggle("is-open", !!hasActive);
    const btn = sec.querySelector("[data-section-toggle]");
    if (btn) btn.setAttribute("aria-expanded", hasActive ? "true" : "false");
  });
}

function renderTopbar(crumbsAttr) {
  return `
    <header class="d-topbar">
      <div class="crumbs">
        <button class="hamburger" data-drawer-open aria-label="${t("topbar.openNav")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        ${renderCrumbs(crumbsAttr)}
      </div>
      <div class="topbar-actions">
        <button class="icon-btn" id="themeToggle" aria-label="${t("topbar.theme")}"></button>
        ${renderLangMenu()}
        <div class="dd-wrap">
          <div class="avatar" data-dropdown tabindex="0" role="button" aria-label="${t("topbar.account")}">·</div>
          <div class="dd-menu dd-profile" role="menu">
            <div class="dd-profile-head">
              <div class="dd-profile-name">—</div>
              <div class="dd-profile-email">—</div>
            </div>
            <a class="dd-menu-item danger" id="bo-logout" href="signin.html">
              <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              ${t("account.logout")}
            </a>
          </div>
        </div>
      </div>
    </header>`;
}

function renderFooter() {
  return `
    <footer class="d-footer">
      <div>${t("footer.line")}</div>
      <div class="d-footer-meta"></div>
    </footer>`;
}

export function mountShell() {
  const body = document.body;
  const activeKey = body.getAttribute("data-active") || "";
  const page = body.getAttribute("data-bo-page") || "home";
  const crumbs = crumbsStringForPage(page);

  const sidebarHost = document.querySelector("[data-shell-sidebar]");
  const topbarHost = document.querySelector("[data-shell-topbar]");
  const footerHost = document.querySelector("[data-shell-footer]");

  if (sidebarHost) sidebarHost.outerHTML = renderSidebar(activeKey);
  if (topbarHost) topbarHost.outerHTML = renderTopbar(crumbs);
  if (footerHost) footerHost.outerHTML = renderFooter();
}
