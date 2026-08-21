import type { Player, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logInfo } from "../lib/logger.js";
import { applyWalletDelta, lockWalletForPlayer } from "../services/wallet-ledger.js";
import { paymentsEnv, type PaymentsProviderId } from "./config.js";
import { extractInitiateMessage, serializeDeposit } from "./deposit.serializer.js";
import { getPaymentProvider } from "./providers/registry.js";
import {
  getActivePaymentMethodById,
  listActiveDepositPaymentMethods,
} from "./payment-method.service.js";
import type {
  DepositDto,
  DepositProfileInput,
  InitiateDepositInput,
  InitiateDepositResult,
  PaymentMethodDto,
  PlayerDepositContext,
  WebhookDepositEvent,
  WebhookHandleResult,
  WebhookParseContext,
} from "./types.js";

function webhookLogContext(
  requestId: string | undefined,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return requestId ? { requestId, ...fields } : fields;
}

export class DepositProfileIncompleteError extends Error {
  readonly missingFields: string[];

  constructor(missingFields: string[]) {
    super("Deposit profile incomplete");
    this.name = "DepositProfileIncompleteError";
    this.missingFields = missingFields;
  }
}

function assertPositiveAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }
  if (amountCents > 1_000_000_000) {
    throw new Error("amountCents exceeds maximum allowed");
  }
}

function resolveProfile(
  player: Player,
  profile: DepositProfileInput | undefined,
  requireStrict: boolean,
): Required<DepositProfileInput> & { firstName: string; lastName: string; dni: string; phone: string; phoneCode: string; countryCode: string } {
  const merged = {
    firstName: profile?.firstName?.trim() || player.firstName?.trim() || "",
    lastName: profile?.lastName?.trim() || player.lastName?.trim() || "",
    dni: profile?.dni?.trim() || player.dni?.trim() || "",
    phone: profile?.phone?.trim() || player.phone?.trim() || "",
    phoneCode: profile?.phoneCode?.trim() || player.phoneCode?.trim() || "54",
    countryCode: profile?.countryCode?.trim() || player.countryCode?.trim() || paymentsEnv.defaultCountry,
  };

  if (!requireStrict) {
    return {
      firstName: merged.firstName || player.username,
      lastName: merged.lastName || "Jugador",
      dni: merged.dni || "00000000",
      phone: merged.phone || "1100000000",
      phoneCode: merged.phoneCode || "54",
      countryCode: merged.countryCode || paymentsEnv.defaultCountry,
    };
  }

  const missing: string[] = [];
  if (!merged.firstName) missing.push("firstName");
  if (!merged.lastName) missing.push("lastName");
  if (!merged.dni) missing.push("dni");
  if (!merged.phone) missing.push("phone");
  if (!merged.phoneCode) missing.push("phoneCode");
  if (!merged.countryCode) missing.push("countryCode");
  if (missing.length) {
    throw new DepositProfileIncompleteError(missing);
  }

  return merged as Required<typeof merged>;
}

async function loadPlayerContext(playerId: string): Promise<{ player: Player; currencyCode: string }> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { wallet: true },
  });
  if (!player) throw new Error("Player not found");
  if (!player.active) throw new Error("Player is inactive");
  const currencyCode = player.wallet?.currencyCode ?? paymentsEnv.defaultCurrency;
  return { player, currencyCode };
}

function toPlayerDepositContext(player: Player, currencyCode: string): PlayerDepositContext {
  return {
    playerId: player.id,
    paymentsUserId: player.paymentsUserId,
    email: player.email,
    username: player.username,
    firstName: player.firstName,
    lastName: player.lastName,
    dni: player.dni,
    phone: player.phone,
    phoneCode: player.phoneCode,
    countryCode: player.countryCode,
    currencyCode,
  };
}

async function maybePersistProfile(playerId: string, profile: DepositProfileInput | undefined): Promise<void> {
  if (!profile) return;
  const data: Record<string, string> = {};
  if (profile.firstName?.trim()) data.firstName = profile.firstName.trim();
  if (profile.lastName?.trim()) data.lastName = profile.lastName.trim();
  if (profile.dni?.trim()) data.dni = profile.dni.trim();
  if (profile.phone?.trim()) data.phone = profile.phone.trim();
  if (profile.phoneCode?.trim()) data.phoneCode = profile.phoneCode.trim();
  if (profile.countryCode?.trim()) data.countryCode = profile.countryCode.trim();
  if (!Object.keys(data).length) return;
  await prisma.player.update({ where: { id: playerId }, data });
}

export async function listDepositPaymentMethods(playerId: string): Promise<PaymentMethodDto[]> {
  const { currencyCode } = await loadPlayerContext(playerId);
  return listActiveDepositPaymentMethods(currencyCode);
}

function validateAmountForMethod(amountCents: number, method: PaymentMethodDto): void {
  if (amountCents < method.minCents) {
    throw new Error(`Amount below minimum for payment method (${method.minCents})`);
  }
  if (amountCents > method.maxCents) {
    throw new Error(`Amount above maximum for payment method (${method.maxCents})`);
  }
}

export async function initiatePlayerDeposit(input: InitiateDepositInput): Promise<InitiateDepositResult> {
  assertPositiveAmount(input.amountCents);

  const { player, currencyCode } = await loadPlayerContext(input.playerId);

  const methodRow = await getActivePaymentMethodById(input.paymentMethodId);
  if (!methodRow || methodRow.currencyCode !== currencyCode) {
    throw new Error("Payment method not found");
  }

  const method: PaymentMethodDto = {
    id: methodRow.id,
    providerId: methodRow.providerId as PaymentsProviderId,
    name: methodRow.name,
    currencyCode: methodRow.currencyCode,
    minCents: methodRow.minCents,
    maxCents: methodRow.maxCents,
  };
  validateAmountForMethod(input.amountCents, method);

  const providerId = method.providerId;
  const provider = getPaymentProvider(providerId);
  const strictProfile = providerId === "mixer-gaming";
  const profile = resolveProfile(player, input.profile, strictProfile);
  await maybePersistProfile(input.playerId, input.profile);

  const deposit = await prisma.deposit.create({
    data: {
      playerId: input.playerId,
      amountCents: input.amountCents,
      currencyCode,
      status: "PENDING",
      providerId: provider.id,
      paymentMethodId: methodRow.id,
      paymentMethodName: methodRow.name,
    },
  });

  const returnUrl = `${paymentsEnv.returnUrlBase}/?deposit=return&depositId=${encodeURIComponent(deposit.id)}`;

  try {
    const result = await provider.initiateDeposit({
      player: toPlayerDepositContext(player, currencyCode),
      depositId: deposit.id,
      amountCents: input.amountCents,
      paymentMethodId: methodRow.externalId,
      paymentMethodName: methodRow.name,
      returnUrl,
      profile,
    });

    const updated = await prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        externalRef: result.externalRef,
        providerPayload: result.providerPayload ?? undefined,
      },
    });

    return {
      depositId: updated.id,
      status: updated.status,
      redirectUrl: result.redirectUrl ?? null,
      qrCode: result.qrCode ?? null,
      message: extractInitiateMessage(result.providerPayload),
    };
  } catch (err) {
    const failedReason = err instanceof Error ? err.message : String(err);
    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: "FAILED", failedReason },
    });
    throw err;
  }
}

export async function getPlayerDeposit(playerId: string, depositId: string): Promise<DepositDto> {
  const row = await prisma.deposit.findFirst({
    where: { id: depositId, playerId },
  });
  if (!row) throw new Error("Deposit not found");
  return serializeDeposit(row);
}

export type DepositAuditDto = {
  id: string;
  status: string;
  amountCents: number;
  currencyCode: string;
  providerId: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  externalRef: string | null;
  failedReason: string | null;
  createdAt: string;
  completedAt: string | null;
  providerPayload: unknown;
  webhookPayload: unknown;
  webhookResponse: unknown;
  webhookReceivedAt: string | null;
};

export async function getPlayerDepositAudit(playerId: string, depositId: string): Promise<DepositAuditDto> {
  const row = await prisma.deposit.findFirst({
    where: { id: depositId, playerId },
  });
  if (!row) throw new Error("Deposit not found");
  return {
    id: row.id,
    status: row.status,
    amountCents: row.amountCents,
    currencyCode: row.currencyCode,
    providerId: row.providerId,
    paymentMethodId: row.paymentMethodId,
    paymentMethodName: row.paymentMethodName,
    externalRef: row.externalRef,
    failedReason: row.failedReason,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    providerPayload: row.providerPayload,
    webhookPayload: row.webhookPayload,
    webhookResponse: row.webhookResponse,
    webhookReceivedAt: row.webhookReceivedAt?.toISOString() ?? null,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function webhookAuditData(
  event: WebhookDepositEvent,
  response: WebhookHandleResult,
): Prisma.DepositUpdateInput {
  return {
    webhookPayload: toJson(event.providerPayload ?? event),
    webhookResponse: toJson(response),
    webhookReceivedAt: new Date(),
  };
}

async function persistWebhookAudit(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  depositId: string,
  event: WebhookDepositEvent,
  response: WebhookHandleResult,
): Promise<void> {
  await tx.deposit.update({
    where: { id: depositId },
    data: webhookAuditData(event, response),
  });
}

async function lockDepositByProviderRef(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  providerId: PaymentsProviderId,
  externalRef: string,
): Promise<{ id: string; playerId: string; amountCents: number; status: string; providerPayload: unknown } | null> {
  await tx.$executeRawUnsafe(
    `SELECT id FROM "Deposit" WHERE "providerId" = $1 AND "externalRef" = $2 FOR UPDATE`,
    providerId,
    externalRef,
  );

  return tx.deposit.findFirst({
    where: { providerId, externalRef },
    select: {
      id: true,
      playerId: true,
      amountCents: true,
      status: true,
      providerPayload: true,
    },
  });
}

export async function failDeposit(
  depositId: string,
  failedReason: string,
  providerPayload?: unknown,
  webhookAudit?: { event: WebhookDepositEvent; response: WebhookHandleResult },
): Promise<WebhookHandleResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT id FROM "Deposit" WHERE id = $1 FOR UPDATE`, depositId);

    const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) {
      return { ok: false, reason: "deposit_not_found" };
    }
    if (deposit.status === "FAILED") {
      const result: WebhookHandleResult = { ok: true, depositId, status: "FAILED", alreadyProcessed: true };
      if (webhookAudit) await persistWebhookAudit(tx, depositId, webhookAudit.event, result);
      return result;
    }
    if (deposit.status === "COMPLETED") {
      return { ok: false, depositId, status: "COMPLETED", reason: "deposit_already_completed" };
    }

    await tx.deposit.update({
      where: { id: depositId },
      data: {
        status: "FAILED",
        failedReason,
        ...(webhookAudit ? webhookAuditData(webhookAudit.event, webhookAudit.response) : {}),
      },
    });

    return { ok: true, depositId, status: "FAILED" };
  });
}

export async function completeDeposit(
  depositId: string,
  providerPayload?: unknown,
  webhookAudit?: { event: WebhookDepositEvent; response: WebhookHandleResult },
): Promise<WebhookHandleResult> {
  void providerPayload;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT id FROM "Deposit" WHERE id = $1 FOR UPDATE`, depositId);

    const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) {
      return { ok: false, reason: "deposit_not_found" };
    }
    if (deposit.status === "COMPLETED") {
      const result: WebhookHandleResult = { ok: true, depositId, status: "COMPLETED", alreadyProcessed: true };
      if (webhookAudit) await persistWebhookAudit(tx, depositId, webhookAudit.event, result);
      return result;
    }
    if (deposit.status === "FAILED") {
      return { ok: false, depositId, status: "FAILED", reason: "deposit_already_failed" };
    }

    const wallet = await lockWalletForPlayer(tx, deposit.playerId);
    const { newBalanceCents } = await applyWalletDelta(tx, wallet, deposit.amountCents);

    await tx.deposit.update({
      where: { id: depositId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        failedReason: null,
        ...(webhookAudit ? webhookAuditData(webhookAudit.event, webhookAudit.response) : {}),
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "DEPOSIT",
        amountCents: deposit.amountCents,
        balanceAfterCents: newBalanceCents,
        depositId: deposit.id,
      },
    });

    return { ok: true, depositId, status: "COMPLETED" };
  });
}

export async function applyWebhookDepositEvent(
  providerId: PaymentsProviderId,
  event: WebhookDepositEvent,
  requestId?: string,
): Promise<WebhookHandleResult> {
  return prisma.$transaction(async (tx) => {
    const deposit = await lockDepositByProviderRef(tx, providerId, event.externalRef);
    if (!deposit) {
      logInfo(
        "payments-webhook-process",
        "deposit not found",
        webhookLogContext(requestId, { providerId, externalRef: event.externalRef }),
      );
      return { ok: false, reason: "deposit_not_found" };
    }

    if (deposit.status === "COMPLETED") {
      const result: WebhookHandleResult = {
        ok: true,
        depositId: deposit.id,
        status: "COMPLETED",
        alreadyProcessed: true,
      };
      logInfo(
        "payments-webhook-process",
        "deposit already completed (idempotent)",
        webhookLogContext(requestId, {
          providerId,
          depositId: deposit.id,
          externalRef: event.externalRef,
        }),
      );
      await persistWebhookAudit(tx, deposit.id, event, result);
      return result;
    }
    if (deposit.status === "FAILED") {
      const result: WebhookHandleResult = {
        ok: false,
        depositId: deposit.id,
        status: "FAILED",
        reason: "deposit_already_failed",
      };
      logInfo(
        "payments-webhook-process",
        "deposit already failed",
        webhookLogContext(requestId, {
          providerId,
          depositId: deposit.id,
          externalRef: event.externalRef,
        }),
      );
      await persistWebhookAudit(tx, deposit.id, event, result);
      return result;
    }

    if (event.success) {
      if (event.amountCents === undefined || event.amountCents <= 0) {
        const reason = `Invalid webhook amount: ${event.amountCents ?? "missing"}`;
        const result: WebhookHandleResult = {
          ok: true,
          depositId: deposit.id,
          status: "FAILED",
          reason: "invalid_webhook_amount",
        };
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            status: "FAILED",
            failedReason: reason,
            ...webhookAuditData(event, result),
          },
        });
        logInfo(
          "payments-webhook-process",
          "deposit failed (invalid webhook amount)",
          webhookLogContext(requestId, {
            providerId,
            depositId: deposit.id,
            externalRef: event.externalRef,
            receivedCents: event.amountCents,
          }),
        );
        return result;
      }

      if (event.amountCents !== deposit.amountCents) {
        const reason = `Amount mismatch: expected ${deposit.amountCents}, got ${event.amountCents}`;
        const result: WebhookHandleResult = {
          ok: true,
          depositId: deposit.id,
          status: "FAILED",
          reason: "amount_mismatch",
        };
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            status: "FAILED",
            failedReason: reason,
            ...webhookAuditData(event, result),
          },
        });
        logInfo(
          "payments-webhook-process",
          "deposit failed (amount mismatch)",
          webhookLogContext(requestId, {
            providerId,
            depositId: deposit.id,
            externalRef: event.externalRef,
            expectedCents: deposit.amountCents,
            receivedCents: event.amountCents,
          }),
        );
        return result;
      }
    }

    if (!event.success) {
      const result: WebhookHandleResult = { ok: true, depositId: deposit.id, status: "FAILED" };
      await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          status: "FAILED",
          failedReason: event.failedReason ?? "Payment provider reported failure",
          ...webhookAuditData(event, result),
        },
      });
      logInfo(
        "payments-webhook-process",
        "deposit failed (provider reported failure)",
        webhookLogContext(requestId, {
          providerId,
          depositId: deposit.id,
          externalRef: event.externalRef,
          failedReason: event.failedReason,
        }),
      );
      return result;
    }

    const wallet = await lockWalletForPlayer(tx, deposit.playerId);
    const { newBalanceCents } = await applyWalletDelta(tx, wallet, deposit.amountCents);

    const result: WebhookHandleResult = { ok: true, depositId: deposit.id, status: "COMPLETED" };
    await tx.deposit.update({
      where: { id: deposit.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        failedReason: null,
        ...webhookAuditData(event, result),
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "DEPOSIT",
        amountCents: deposit.amountCents,
        balanceAfterCents: newBalanceCents,
        depositId: deposit.id,
      },
    });

    logInfo(
      "payments-webhook-process",
      "deposit completed and wallet credited",
      webhookLogContext(requestId, {
        providerId,
        depositId: deposit.id,
        externalRef: event.externalRef,
        playerId: deposit.playerId,
        amountCents: deposit.amountCents,
        balanceAfterCents: newBalanceCents,
      }),
    );

    return result;
  });
}

export async function handlePaymentProviderWebhook(
  providerId: PaymentsProviderId,
  ctx: WebhookParseContext,
): Promise<WebhookHandleResult> {
  const provider = getPaymentProvider(providerId);
  if (provider.id !== providerId) {
    throw new Error("Provider mismatch");
  }

  const event = provider.parseWebhook(ctx);
  logInfo(
    "payments-webhook-process",
    "webhook parsed",
    webhookLogContext(ctx.requestId, {
      providerId,
      externalRef: event.externalRef,
      success: event.success,
      amountCents: event.amountCents,
    }),
  );

  const result = await applyWebhookDepositEvent(providerId, event, ctx.requestId);
  logInfo(
    "payments-webhook-process",
    "webhook applied",
    webhookLogContext(ctx.requestId, {
      providerId,
      externalRef: event.externalRef,
      depositId: result.depositId,
      result,
    }),
  );
  return result;
}
