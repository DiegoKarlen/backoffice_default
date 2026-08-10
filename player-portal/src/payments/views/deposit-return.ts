import { escapeHtml } from "@shared/index.ts";
import { el } from "../../lib/dom.js";
import type { DepositStatusDto } from "../api-client.js";

const STATUS_LABEL: Record<DepositStatusDto, string> = {
  PENDING: "Pendiente de confirmación",
  COMPLETED: "Acreditado",
  FAILED: "No completado",
};

type InProgressOptions = {
  popupBlocked?: boolean;
  hint?: string;
  onReopen?: () => void;
};

function buildInProgressDetail(
  status: DepositStatusDto,
  failedReason?: string | null,
  options: InProgressOptions = {},
): string {
  if (status === "FAILED" && failedReason) {
    return `<p class="pp-deposit-return__detail">${escapeHtml(failedReason)}</p>`;
  }
  if (status === "COMPLETED") {
    return `<p class="pp-muted pp-deposit-return__hint">El saldo ya está disponible en tu cuenta.</p>`;
  }
  if (options.hint) {
    return `<p class="pp-muted pp-deposit-return__hint">${escapeHtml(options.hint)}</p>`;
  }
  if (options.popupBlocked) {
    return `<p class="pp-muted pp-deposit-return__hint">El navegador bloqueó o cerró la ventana de pago.</p>
      <button type="button" class="pp-btn pp-deposit-return__reopen">Abrir ventana de pago</button>`;
  }
  return `<p class="pp-muted pp-deposit-return__hint">Completá el pago en la ventana del gateway. Esta página se actualizará sola.</p>`;
}

/** Aviso en la página del portal mientras el pago corre en popup (sin modal overlay). */
export function renderDepositInProgressNotice(
  container: HTMLElement,
  depositId: string,
  options: InProgressOptions = {},
): void {
  const existing = container.querySelector("#pp-deposit-return");
  existing?.remove();

  const notice = el(`
    <div id="pp-deposit-return" class="pp-deposit-return pp-deposit-return--pending" role="status">
      <p class="pp-deposit-return__title">Pago en curso</p>
      <p class="pp-deposit-return__meta">Referencia: <span class="mono">${escapeHtml(depositId)}</span></p>
      <p class="pp-deposit-return__status">Estado: <strong>${escapeHtml(STATUS_LABEL.PENDING)}</strong></p>
      ${buildInProgressDetail("PENDING", null, options)}
    </div>`);

  notice.querySelector(".pp-deposit-return__reopen")?.addEventListener("click", () => {
    options.onReopen?.();
  });

  container.prepend(notice);
}

export function updateDepositInProgressNotice(
  container: HTMLElement,
  depositId: string,
  status: DepositStatusDto,
  failedReason?: string | null,
  options: InProgressOptions = {},
): void {
  const existing = container.querySelector("#pp-deposit-return");
  existing?.remove();

  const statusClass =
    status === "COMPLETED"
      ? "pp-deposit-return--ok"
      : status === "FAILED"
        ? "pp-deposit-return--error"
        : "pp-deposit-return--pending";

  const title =
    status === "COMPLETED" ? "Depósito acreditado" : status === "FAILED" ? "Depósito no completado" : "Pago en curso";

  const notice = el(`
    <div id="pp-deposit-return" class="pp-deposit-return ${statusClass}" role="status">
      <p class="pp-deposit-return__title">${escapeHtml(title)}</p>
      <p class="pp-deposit-return__meta">Referencia: <span class="mono">${escapeHtml(depositId)}</span></p>
      <p class="pp-deposit-return__status">Estado: <strong>${escapeHtml(STATUS_LABEL[status])}</strong></p>
      ${buildInProgressDetail(status, failedReason, options)}
    </div>`);

  notice.querySelector(".pp-deposit-return__reopen")?.addEventListener("click", () => {
    options.onReopen?.();
  });

  container.prepend(notice);
}

/** Banner al volver de un redirect externo; se actualiza con el estado del depósito. */
export function renderDepositReturnNotice(
  container: HTMLElement,
  depositId: string,
  status: DepositStatusDto = "PENDING",
  failedReason?: string | null,
): void {
  const existing = container.querySelector("#pp-deposit-return");
  existing?.remove();

  const statusClass =
    status === "COMPLETED"
      ? "pp-deposit-return--ok"
      : status === "FAILED"
        ? "pp-deposit-return--error"
        : "pp-deposit-return--pending";

  const detail =
    status === "FAILED" && failedReason
      ? `<p class="pp-deposit-return__detail">${escapeHtml(failedReason)}</p>`
      : status === "PENDING"
        ? `<p class="pp-muted pp-deposit-return__hint">Estamos verificando el pago con el gateway…</p>`
        : `<p class="pp-muted pp-deposit-return__hint">El saldo ya está disponible en tu cuenta.</p>`;

  const notice = el(`
    <div id="pp-deposit-return" class="pp-deposit-return ${statusClass}" role="status">
      <p class="pp-deposit-return__title">Volviste del proceso de depósito</p>
      <p class="pp-deposit-return__meta">Referencia: <span class="mono">${escapeHtml(depositId)}</span></p>
      <p class="pp-deposit-return__status">Estado: <strong>${escapeHtml(STATUS_LABEL[status])}</strong></p>
      ${detail}
    </div>`);
  container.prepend(notice);
}

export function updateDepositReturnNotice(
  container: HTMLElement,
  depositId: string,
  status: DepositStatusDto,
  failedReason?: string | null,
): void {
  renderDepositReturnNotice(container, depositId, status, failedReason);
}
