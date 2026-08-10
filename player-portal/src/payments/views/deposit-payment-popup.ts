import {
  renderDepositInProgressNotice,
  updateDepositInProgressNotice,
} from "./deposit-return.js";

export type DepositPaymentPopupOptions = {
  depositId: string;
  redirectUrl: string;
  statusHost: HTMLElement;
  fetchDeposit: (id: string) => Promise<{ status: string; failedReason?: string | null } | null>;
  onComplete?: () => void | Promise<void>;
  onFailed?: (reason?: string | null) => void;
  onClosed?: () => void;
  onPopupBlocked?: () => void;
};

const POPUP_NAME = "pp-deposit-payment";
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 760;

function openPaymentPopup(url: string): Window | null {
  const left = Math.max(0, window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);
  const features = [
    `width=${POPUP_WIDTH}`,
    `height=${POPUP_HEIGHT}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    "scrollbars=yes",
    "resizable=yes",
  ].join(",");
  return window.open(url, POPUP_NAME, features);
}

/**
 * Abre el checkout en popup y mantiene al usuario en la página del portal (sin modal overlay).
 */
export function openDepositPaymentPopup(options: DepositPaymentPopupOptions): () => void {
  const { depositId, redirectUrl, statusHost, fetchDeposit, onComplete, onFailed, onClosed, onPopupBlocked } =
    options;
  let disposed = false;
  let pollTimer: number | undefined;
  let popupWatchTimer: number | undefined;
  let paymentPopup: Window | null = null;
  let reopenHandler: (() => void) | null = null;

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (pollTimer != null) window.clearInterval(pollTimer);
    if (popupWatchTimer != null) window.clearInterval(popupWatchTimer);
    onClosed?.();
  }

  function mountNotice(popupBlocked: boolean): void {
    renderDepositInProgressNotice(statusHost, depositId, {
      popupBlocked,
      onReopen: () => reopenHandler?.(),
    });
  }

  async function pollOnce(finalAttempt = false): Promise<boolean> {
    if (disposed) return true;
    try {
      const deposit = await fetchDeposit(depositId);
      if (!deposit || disposed) return true;

      updateDepositInProgressNotice(statusHost, depositId, deposit.status as "PENDING" | "COMPLETED" | "FAILED", deposit.failedReason);

      if (deposit.status === "COMPLETED") {
        dispose();
        await onComplete?.();
        return true;
      }
      if (deposit.status === "FAILED") {
        dispose();
        onFailed?.(deposit.failedReason);
        return true;
      }
      if (finalAttempt) {
        updateDepositInProgressNotice(statusHost, depositId, "PENDING", null, {
          hint: "El depósito sigue pendiente. Podés revisar más tarde en Movimientos.",
        });
      }
    } catch {
      if (finalAttempt) {
        updateDepositInProgressNotice(statusHost, depositId, "PENDING", null, {
          hint: "No se pudo verificar el estado. Revisá Movimientos.",
        });
      }
    }
    return false;
  }

  function launchPopup(): Window | null {
    const popup = openPaymentPopup(redirectUrl);
    paymentPopup = popup;
    if (!popup) {
      mountNotice(true);
      onPopupBlocked?.();
      return null;
    }
    mountNotice(false);
    popup.focus();
    return popup;
  }

  reopenHandler = () => {
    launchPopup();
  };

  pollTimer = window.setInterval(() => {
    void pollOnce();
  }, 3000);

  popupWatchTimer = window.setInterval(() => {
    if (disposed || !paymentPopup) return;
    if (paymentPopup.closed) {
      paymentPopup = null;
      updateDepositInProgressNotice(statusHost, depositId, "PENDING", null, {
        popupBlocked: true,
        hint: "Cerraste la ventana de pago. Podés reabrirla para continuar.",
        onReopen: () => reopenHandler?.(),
      });
      void pollOnce(true);
    }
  }, 500);

  launchPopup();

  return dispose;
}
