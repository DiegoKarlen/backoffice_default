import { escapeHtml, formatMoneyFromCents } from "@shared/index.ts";
import { el } from "../../lib/dom.js";
import {
  fetchDepositById,
  fetchDepositPaymentMethods,
  initiateDeposit,
  type DepositProfilePayload,
} from "../api-client.js";
import {
  formatMethodLimits,
  parseAmountInputToCents,
  validateDepositAmount,
} from "../deposit-flow.js";
import { getPaymentProviderUiAdapter } from "../providers/registry.js";
import type { DepositMountContext, PaymentMethodOption } from "../types.js";
import { renderDepositReturnNotice, updateDepositReturnNotice } from "./deposit-return.js";
import { openDepositPaymentPopup } from "./deposit-payment-popup.js";

function readProfileFromForm(formHost: HTMLElement): DepositProfilePayload {
  const val = (id: string) =>
    (formHost.querySelector(`#${id}`) as HTMLInputElement | null)?.value.trim() ?? "";
  const profile: DepositProfilePayload = {};
  const firstName = val("pp-deposit-first-name");
  const lastName = val("pp-deposit-last-name");
  const dni = val("pp-deposit-dni");
  const phone = val("pp-deposit-phone");
  const phoneCode = val("pp-deposit-phone-code");
  if (firstName) profile.firstName = firstName;
  if (lastName) profile.lastName = lastName;
  if (dni) profile.dni = dni;
  if (phone) profile.phone = phone;
  if (phoneCode) profile.phoneCode = phoneCode;
  return profile;
}

function parseApiError(e: unknown): string {
  if (!(e instanceof Error)) return "No se pudo iniciar el depósito.";
  if (e.message.includes("Deposit profile incomplete")) {
    return "Completá nombre, apellido, DNI y teléfono para el método seleccionado.";
  }
  return e.message;
}

export function mountDepositForm(container: HTMLElement, ctx: DepositMountContext): () => void {
  let disposed = false;
  let methods: PaymentMethodOption[] = [];
  let selectedMethodId = "";

  container.innerHTML = `
    <div class="pp-card-block pp-deposit">
      <h2 class="pp-section-title">Depositar</h2>
      <p class="pp-hint">
        Sumá saldo a tu cuenta para comprar cartones. Elegí el monto y el método de pago.
      </p>
      <div id="pp-deposit-form-host">
        <p class="pp-loading">Cargando métodos de pago…</p>
      </div>
    </div>`;

  const depositRoot = container.querySelector(".pp-deposit") as HTMLElement;
  const formHost = container.querySelector("#pp-deposit-form-host") as HTMLElement;

  if (ctx.depositReturnId) {
    renderDepositReturnNotice(depositRoot, ctx.depositReturnId);
    void pollDepositReturn(ctx.depositReturnId);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function pollDepositReturn(depositId: string): Promise<void> {
    const maxAttempts = 40;
    const intervalMs = 3000;

    for (let attempt = 0; attempt < maxAttempts && !disposed; attempt += 1) {
      try {
        const deposit = await fetchDepositById(depositId);
        if (!deposit || disposed) return;

        updateDepositReturnNotice(depositRoot, depositId, deposit.status, deposit.failedReason);

        if (deposit.status === "COMPLETED") {
          ctx.showMessage("Depósito acreditado correctamente.");
          await ctx.onBalanceChanged?.();
          return;
        }
        if (deposit.status === "FAILED") {
          ctx.showMessage(deposit.failedReason ?? "El depósito no pudo completarse.");
          return;
        }
        if (attempt === 0) {
          ctx.showMessage("Depósito pendiente de confirmación del gateway.");
        }
      } catch {
        /* ignore polling errors */
      }

      if (attempt < maxAttempts - 1 && !disposed) {
        await sleep(intervalMs);
      }
    }

    if (!disposed) {
      ctx.showMessage("El depósito sigue pendiente. Revisá más tarde en Movimientos.");
    }
  }

  function getSelectedMethod(): PaymentMethodOption | null {
    return methods.find((m) => m.id === selectedMethodId) ?? null;
  }

  function paintProfileSection(): void {
    const profileEl = formHost.querySelector("#pp-deposit-profile") as HTMLElement | null;
    if (profileEl) {
      profileEl.hidden = !selectedMethodId;
    }
  }

  function paintLimits(): void {
    const limitsEl = formHost.querySelector("#pp-deposit-limits");
    if (limitsEl) limitsEl.textContent = formatMethodLimits(getSelectedMethod());
  }

  function renderForm(): void {
    if (disposed) return;

    const opts =
      methods.length === 0
        ? `<option value="">— Sin métodos disponibles —</option>`
        : `<option value="">Seleccioná método…</option>${methods
            .map(
              (m) =>
                `<option value="${escapeHtml(m.id)}"${m.id === selectedMethodId ? " selected" : ""}>${escapeHtml(m.name)}</option>`,
            )
            .join("")}`;

    formHost.innerHTML = `
      <div class="pp-field">
        <label for="pp-deposit-amount">Monto (${escapeHtml(ctx.currencyCode)})</label>
        <input
          id="pp-deposit-amount"
          class="pp-input pp-deposit-amount"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0,00"
        />
        <p class="pp-muted pp-deposit-limits" id="pp-deposit-limits">${escapeHtml(formatMethodLimits(getSelectedMethod()))}</p>
      </div>
      <div class="pp-field">
        <label for="pp-deposit-method">Método de depósito</label>
        <select id="pp-deposit-method" class="pp-select">${opts}</select>
      </div>
      <div class="pp-deposit-profile" id="pp-deposit-profile" hidden>
        <p class="pp-hint pp-deposit-profile__title">Datos requeridos para el método seleccionado</p>
        <div class="pp-deposit-profile__grid">
          <div class="pp-field">
            <label for="pp-deposit-first-name">Nombre</label>
            <input id="pp-deposit-first-name" class="pp-input" type="text" autocomplete="given-name" />
          </div>
          <div class="pp-field">
            <label for="pp-deposit-last-name">Apellido</label>
            <input id="pp-deposit-last-name" class="pp-input" type="text" autocomplete="family-name" />
          </div>
          <div class="pp-field">
            <label for="pp-deposit-dni">DNI</label>
            <input id="pp-deposit-dni" class="pp-input" type="text" inputmode="numeric" />
          </div>
          <div class="pp-field">
            <label for="pp-deposit-phone-code">Cód. país</label>
            <input id="pp-deposit-phone-code" class="pp-input" type="text" value="54" inputmode="tel" />
          </div>
          <div class="pp-field pp-field--wide">
            <label for="pp-deposit-phone">Teléfono</label>
            <input id="pp-deposit-phone" class="pp-input" type="text" inputmode="tel" autocomplete="tel" />
          </div>
        </div>
      </div>
      <div class="pp-deposit-actions">
        <button type="button" class="pp-btn" id="pp-deposit-submit">Depositar</button>
      </div>
      <div id="pp-deposit-qr" class="pp-deposit-qr" hidden></div>`;

    const methodSelect = formHost.querySelector("#pp-deposit-method") as HTMLSelectElement;
    methodSelect?.addEventListener("change", () => {
      selectedMethodId = methodSelect.value.trim();
      paintLimits();
      paintProfileSection();
    });

    paintProfileSection();

    formHost.querySelector("#pp-deposit-submit")?.addEventListener("click", () => {
      void onSubmit();
    });
  }

  async function onSubmit(): Promise<void> {
    if (disposed) return;
    ctx.showMessage("");

    const amountRaw = (formHost.querySelector("#pp-deposit-amount") as HTMLInputElement | null)?.value ?? "";
    const methodSelect = formHost.querySelector("#pp-deposit-method") as HTMLSelectElement | null;
    selectedMethodId = methodSelect?.value.trim() ?? "";
    const method = getSelectedMethod();
    const amountCents = parseAmountInputToCents(amountRaw);
    const validationError = validateDepositAmount(amountCents, method);
    if (validationError) {
      ctx.showMessage(validationError);
      return;
    }

    const submitBtn = formHost.querySelector("#pp-deposit-submit") as HTMLButtonElement | null;
    const qrHost = formHost.querySelector("#pp-deposit-qr") as HTMLElement | null;
    if (qrHost) {
      qrHost.hidden = true;
      qrHost.innerHTML = "";
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Procesando…";
    }

    try {
      const profile = readProfileFromForm(formHost);
      const result = await initiateDeposit(
        {
          amountCents: amountCents!,
          paymentMethodId: method!.id,
          providerId: method!.providerId,
        },
        profile,
      );

      const adapter = getPaymentProviderUiAdapter(method!.providerId);
      const mode = adapter?.handleInitResponse(result) ?? "message";

      if ((mode === "redirect" || mode === "embedded") && result.redirectUrl) {
        openDepositPaymentPopup({
          depositId: result.depositId,
          redirectUrl: result.redirectUrl,
          statusHost: depositRoot,
          fetchDeposit: fetchDepositById,
          onComplete: async () => {
            ctx.showMessage("Depósito acreditado correctamente.");
            await ctx.onBalanceChanged?.();
          },
          onFailed: (reason) => {
            ctx.showMessage(reason ?? "El depósito no pudo completarse.");
          },
          onPopupBlocked: () => {
            ctx.showMessage("Permití ventanas emergentes para este sitio o usá «Abrir ventana de pago».");
          },
          onClosed: () => {
            if (submitBtn && !disposed) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Depositar";
            }
          },
        });
        return;
      }

      if (mode === "qr" && result.qrCode && qrHost) {
        qrHost.hidden = false;
        qrHost.innerHTML = `
          <p class="pp-deposit-qr__label">Escaneá el código para pagar</p>
          <p class="mono pp-deposit-qr__code">${escapeHtml(result.qrCode)}</p>`;
        ctx.showMessage("Depósito iniciado. Completá el pago con el QR.");
        return;
      }

      const amountLabel = formatMoneyFromCents(amountCents!, ctx.currencyCode);
      ctx.showMessage(
        result.message ??
          `Solicitud de depósito por ${amountLabel} registrada (ref. ${result.depositId}).`,
      );

      if (result.status === "COMPLETED") {
        await ctx.onBalanceChanged?.();
      }
    } catch (e) {
      ctx.showMessage(parseApiError(e));
    } finally {
      if (submitBtn && !disposed) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Depositar";
      }
    }
  }

  void (async () => {
    try {
      methods = await fetchDepositPaymentMethods();
      if (disposed) return;
      renderForm();
    } catch (e) {
      if (disposed) return;
      formHost.innerHTML = `<p class="pp-msg">${escapeHtml(e instanceof Error ? e.message : "Error al cargar métodos")}</p>`;
    }
  })();

  return () => {
    disposed = true;
    container.innerHTML = "";
  };
}
