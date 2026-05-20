/**
 * Paginador reutilizable para tablas del backoffice (client-side).
 */
import { t } from "./bo-i18n.js";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

/**
 * @param {HTMLElement | null | undefined} tbody
 * @returns {HTMLElement | null | undefined}
 */
export function pagerAnchorFromTbody(tbody) {
  return tbody?.parentElement?.parentElement ?? tbody?.parentElement ?? null;
}

/**
 * @param {number} totalPages
 * @param {number} page
 * @returns {Array<number | "…">}
 */
function pageTokens(totalPages, page) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const tokens = [];
  const add = (n) => {
    if (tokens[tokens.length - 1] !== n) tokens.push(n);
  };
  add(1);
  if (page > 3) add("…");
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
    add(p);
  }
  if (page < totalPages - 2) add("…");
  if (totalPages > 1) add(totalPages);
  return tokens;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.anchor — contenedor de la tabla (pager se inserta después)
 * @param {() => unknown[]} opts.getItems
 * @param {(slice: unknown[], meta: { page: number; pageSize: number; total: number; totalPages: number; from: number; to: number }) => void} opts.renderPage
 * @param {number} [opts.pageSize]
 * @param {number[]} [opts.pageSizeOptions]
 */
export function attachBoPager(opts) {
  const { anchor, getItems, renderPage } = opts;
  const pageSizeOptions = opts.pageSizeOptions ?? PAGE_SIZE_OPTIONS;
  let pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  let page = 1;

  let foot = anchor.nextElementSibling;
  if (!(foot instanceof HTMLElement) || !foot.classList.contains("bo-table-pager")) {
    foot = document.createElement("div");
    foot.className = "bo-table-pager";
    anchor.insertAdjacentElement("afterend", foot);
  }

  function goTo(nextPage) {
    page = Math.max(1, Math.min(nextPage, Math.max(1, Math.ceil(getItems().length / pageSize))));
    refresh();
  }

  function paintFoot(meta) {
    const { total, totalPages, from, to } = meta;
    const info =
      total === 0
        ? t("pager.empty")
        : t("pager.info", { from: String(from), to: String(to), total: String(total) });

    const sizeOpts = pageSizeOptions
      .map(
        (n) =>
          `<option value="${n}"${n === pageSize ? " selected" : ""}>${esc(t("pager.perPage", { n: String(n) }))}</option>`,
      )
      .join("");

    const tokens = pageTokens(totalPages, page);
    const pageBtns = tokens
      .map((tok) => {
        if (tok === "…") {
          return `<span class="bo-table-pager__gap" aria-hidden="true">…</span>`;
        }
        const active = tok === page ? " is-active" : "";
        return `<button type="button" class="pager-btn${active}" data-page="${tok}" aria-label="${esc(t("pager.pageAria", { n: String(tok) }))}" aria-current="${tok === page ? "page" : "false"}">${tok}</button>`;
      })
      .join("");

    foot.innerHTML = `
      <div class="bo-table-pager__info field-help">${esc(info)}</div>
      <div class="bo-table-pager__controls">
        <label class="bo-table-pager__size">
          <span class="field-help">${esc(t("pager.pageSizeLabel"))}</span>
          <select class="input input--underline bo-table-pager__size-select" aria-label="${esc(t("pager.pageSizeLabel"))}">${sizeOpts}</select>
        </label>
        <div class="pager" role="navigation" aria-label="${esc(t("pager.navAria"))}">
          <button type="button" class="pager-btn" data-dir="prev" aria-label="${esc(t("pager.prev"))}"${page <= 1 ? " disabled" : ""}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          ${pageBtns}
          <button type="button" class="pager-btn" data-dir="next" aria-label="${esc(t("pager.next"))}"${page >= totalPages ? " disabled" : ""}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </div>`;

    foot.querySelector('[data-dir="prev"]')?.addEventListener("click", () => goTo(page - 1));
    foot.querySelector('[data-dir="next"]')?.addEventListener("click", () => goTo(page + 1));
    foot.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.getAttribute("data-page"));
        if (Number.isFinite(n)) goTo(n);
      });
    });
    foot.querySelector(".bo-table-pager__size-select")?.addEventListener("change", (ev) => {
      const n = Number(/** @type {HTMLSelectElement} */ (ev.target).value);
      if (Number.isFinite(n) && n > 0) {
        pageSize = n;
        page = 1;
        refresh();
      }
    });
  }

  function refresh() {
    const items = getItems();
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    const from = total === 0 ? 0 : start + 1;
    const to = start + slice.length;
    renderPage(slice, { page, pageSize, total, totalPages, from, to });
    paintFoot({ total, totalPages, from, to });
  }

  return {
    refresh,
    reset: () => {
      page = 1;
      refresh();
    },
  };
}
