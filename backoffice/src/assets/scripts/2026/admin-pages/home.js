/**
 * Admin pages — home dashboard (upcoming bingos).
 */
import { api } from "../bo-api.js";
import { getLocale, t } from "../bo-i18n.js";
import {
  disposeHomeLiveDraw,
  refreshHomeLiveDraw,
  startHomeLiveDrawPolling,
  wireHomeLiveDraw,
} from "./home-live-draw.js";
/** @returns {string} */
function boIntlLocaleTag() {
  const loc = getLocale();
  if (loc === "es") return "es-ES";
  return "en-US";
}

function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0)
    return { text: "00:00:00", subKey: "home.bingoCountdownLive", done: true };
  const secTotal = Math.floor(ms / 1000);
  const days = Math.floor(secTotal / 86400);
  const hh = Math.floor((secTotal % 86400) / 3600);
  const mm = Math.floor((secTotal % 3600) / 60);
  const ss = secTotal % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (days > 0)
    return { text: `${days}d ${pad(hh)}:${pad(mm)}:${pad(ss)}`, subKey: null, done: false };
  return {
    text: `${pad(hh)}:${pad(mm)}:${pad(ss)}`,
    subKey: secTotal < 60 ? "home.bingoCountdownSoon" : null,
    done: false,
  };
}

function formatStartsAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(boIntlLocaleTag(), {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function metaLine(bingoType, cardPrice) {
  const typeNum = String(bingoType).replace(/\D/g, "") || "?";
  return t("home.bingoMetaTemplate", { type: typeNum, price: cardPrice });
}

/** @param {string | undefined} drawMode */
function drawModeLabel(drawMode) {
  return drawMode === "LIVE" ? t("bingo.drawModeLive") : t("bingo.drawModeVirtual");
}

/**
 * @param {HTMLElement | null} el
 * @param {string | undefined} drawMode
 */
function paintDrawModeTag(el, drawMode) {
  if (!el) return;
  const isLive = drawMode === "LIVE";
  el.textContent = drawModeLabel(drawMode);
  el.className = `bo-home-draw-mode tag ${isLive ? "bo-home-draw-mode--live" : "bo-home-draw-mode--virtual"}`;
  el.hidden = false;
}

/**
 * @param {string | undefined} drawMode
 * @returns {HTMLSpanElement}
 */
function createDrawModeTag(drawMode) {
  const tag = document.createElement("span");
  paintDrawModeTag(tag, drawMode);
  return tag;
}

const BO_HOME_ROOM_SLUG_KEY = "bo_home_room_slug";

function disposeHomeCountdown() {
  if (window.__boHomeCountdownTimer) {
    clearInterval(window.__boHomeCountdownTimer);
    window.__boHomeCountdownTimer = null;
  }
}

function disposeHomePage() {
  disposeHomeCountdown();
  disposeHomeLiveDraw();
}

async function initHomePage() {
  const wrap = document.querySelector("[data-bo-home-wrap]");
  const msg = document.getElementById("bo-home-msg");
  const nextEl = document.getElementById("bo-home-next");
  const upcomingEl = document.getElementById("bo-home-upcoming");
  const roomSel = document.getElementById("bo-home-room");
  const roomBar = document.getElementById("bo-home-roombar");
  if (!wrap || !nextEl || !upcomingEl) return;

  disposeHomePage();
  wireHomeLiveDraw();

  const titleEl = document.getElementById("bo-home-next-title");
  const metaEl = document.getElementById("bo-home-next-meta");
  const badgeEl = document.getElementById("bo-home-next-badge");
  const nextDrawModeEl = document.getElementById("bo-home-next-draw-mode");
  const cdEl = document.getElementById("bo-home-countdown");
  const cdSubEl = document.getElementById("bo-home-countdown-sub");
  const startsEl = document.getElementById("bo-home-next-starts");
  const listEl = document.getElementById("bo-home-upcoming-list");
  const emptyEl = document.getElementById("bo-home-upcoming-empty");

  async function loadRoomsIntoSelect() {
    if (!roomSel) return "";
    roomSel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = t("home.bingoRoomAll");
    roomSel.appendChild(opt0);
    try {
      const res = await api.rooms.list({ status: "ACTIVE" });
      const rooms = Array.isArray(res?.rooms) ? res.rooms : [];
      for (const r of rooms) {
        if (!r.slug) continue;
        const o = document.createElement("option");
        o.value = String(r.slug);
        o.textContent = r.name ? String(r.name) : String(r.slug);
        roomSel.appendChild(o);
      }
    } catch {
      /* solo "Todas" */
    }
    let saved = "";
    try {
      saved = (localStorage.getItem(BO_HOME_ROOM_SLUG_KEY) || "").trim();
    } catch {
      /* ignore */
    }
    if (saved && [...roomSel.options].some((o) => o.value === saved)) roomSel.value = saved;
    else roomSel.value = "";
    return roomSel.value;
  }

  async function refreshUpcoming(roomSlug) {
    disposeHomeCountdown();
    const slug = typeof roomSlug === "string" ? roomSlug.trim() : "";
    try {
      const data = await api.bingos.upcoming({
        limit: 24,
        horizonDays: 14,
        roomSlug: slug || undefined,
      });
      const upcoming = Array.isArray(data?.upcoming) ? data.upcoming : [];
      const next = data?.next || upcoming[0] || null;

      if (msg) msg.style.display = "none";

      if (!next) {
        nextEl.hidden = true;
        upcomingEl.hidden = false;
        if (listEl) listEl.innerHTML = "";
        if (emptyEl) emptyEl.style.display = "block";
        return;
      }

      nextEl.hidden = false;
      upcomingEl.hidden = false;
      if (emptyEl) emptyEl.style.display = upcoming.length ? "none" : "block";

      if (titleEl) titleEl.textContent = next.name || "—";
      if (metaEl) metaEl.textContent = metaLine(next.bingoType, next.cardPrice);
      paintDrawModeTag(nextDrawModeEl, next.drawMode);
      if (badgeEl) badgeEl.textContent = String(next.bingoType || "").replace(/\D/g, "") || "?";

      const targetMs =
        typeof next.startsAtMs === "number" ? next.startsAtMs : new Date(next.startsAt).getTime();

      let postStartUpcomingRefreshPending = false;

      function tick() {
        const remain = targetMs - Date.now();
        const cd = formatCountdown(remain);
        if (cdEl) cdEl.textContent = cd.text;
        if (cdSubEl) {
          const sub = cd.subKey ? t(cd.subKey) : "";
          cdSubEl.textContent = sub || "";
          cdSubEl.style.display = sub ? "block" : "none";
        }
        if (startsEl) {
          startsEl.textContent = `${t("home.bingoStartsAtLabel")}: ${formatStartsAt(next.startsAt)}`;
        }
        const roomSlugNow = roomSel?.value?.trim() ?? slug;
        if (remain <= 0 || cd.done) {
          void refreshHomeLiveDraw(roomSlugNow);
        }
        if (cd.done && !postStartUpcomingRefreshPending) {
          postStartUpcomingRefreshPending = true;
          void refreshUpcoming(roomSlugNow).finally(() => {
            postStartUpcomingRefreshPending = false;
          });
        }
        if (cd.done && window.__boHomeCountdownTimer) {
          clearInterval(window.__boHomeCountdownTimer);
          window.__boHomeCountdownTimer = null;
        }
      }

      tick();
      window.__boHomeCountdownTimer = setInterval(tick, 1000);

      if (listEl) {
        listEl.innerHTML = "";
        upcoming.slice(0, 12).forEach((row, idx) => {
          const li = document.createElement("li");
          li.className = "bo-home-upcoming__item";
          const rank = document.createElement("div");
          rank.className = "bo-home-upcoming__rank mono";
          rank.textContent = String(idx + 1).padStart(2, "0");

          const body = document.createElement("div");
          body.className = "bo-home-upcoming__body";

          const titleRow = document.createElement("div");
          titleRow.className = "bo-home-upcoming__title-row";

          const line1 = document.createElement("div");
          line1.className = "bo-home-upcoming__name";
          line1.textContent = row.name || "—";

          titleRow.append(line1, createDrawModeTag(row.drawMode));

          const line2 = document.createElement("div");
          line2.className = "bo-home-upcoming__when mono";
          line2.textContent = formatStartsAt(row.startsAt);

          const pill = document.createElement("span");
          pill.className = "bo-home-upcoming__pill mono";
          pill.textContent = String(row.bingoType || "").replace(/\D/g, "") || "?";

          body.append(titleRow, line2);
          li.append(rank, body, pill);
          listEl.appendChild(li);
        });
      }
    } catch {
      if (msg) {
        msg.style.display = "block";
        msg.textContent = t("home.bingoLoadError");
        msg.style.color = "var(--danger, #c0392b)";
      }
      nextEl.hidden = true;
      upcomingEl.hidden = true;
    }
  }

  if (roomSel) {
    await loadRoomsIntoSelect();
    if (!roomSel.dataset.boHomeRoomWired) {
      roomSel.dataset.boHomeRoomWired = "1";
      roomSel.addEventListener("change", () => {
        const v = roomSel.value.trim();
        try {
          localStorage.setItem(BO_HOME_ROOM_SLUG_KEY, v);
        } catch {
          /* ignore */
        }
        void refreshUpcoming(v).then(() => startHomeLiveDrawPolling(v));
      });
    }
    const initialSlug = roomSel.value;
    await refreshUpcoming(initialSlug);
    startHomeLiveDrawPolling(initialSlug);
  } else {
    if (roomBar) roomBar.hidden = true;
    await refreshUpcoming("");
    startHomeLiveDrawPolling("");
  }
}

export { disposeHomePage, initHomePage };
