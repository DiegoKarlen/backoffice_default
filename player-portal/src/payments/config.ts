/** Feature flag: tab Depositar y módulo de pagos en el portal. */
export function isPaymentsEnabled(): boolean {
  const v = import.meta.env.VITE_PAYMENTS_ENABLED;
  if (v === "0" || v === "false") return false;
  return v === "1" || v === "true" || v === undefined;
}
