/** Provider id for backoffice manual wallet credits (idempotent via externalRef). */
export const MANUAL_CREDIT_PROVIDER_ID = "manual-bo";

export function manualCreditExternalRef(idempotencyKey: string): string {
  return idempotencyKey.trim();
}
