import type { Prisma } from "@prisma/client";
import { WalletTransactionType } from "@prisma/client";
import { prisma } from "./prisma.js";

export type WalletTransactionDetailJson = {
  kind: "prize" | "purchase" | "deposit" | "refund" | "adjustment" | null;
  roomName?: string | null;
  roomSlug?: string | null;
  bingoId?: string | null;
  bingoName?: string | null;
  bingoRoundId?: string | null;
  figure?: string;
  roundSequence?: number | null;
  depositNote?: string | null;
  depositId?: string | null;
  depositExternalRef?: string | null;
};

export type WalletTransactionRowJson = {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number | null;
  createdAt: string;
  detail: WalletTransactionDetailJson;
};

const ALLOWED_TYPES = Object.values(WalletTransactionType) as string[];

function parseOptionalType(raw: string | undefined): WalletTransactionType | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const t = raw.trim().toUpperCase();
  if (!ALLOWED_TYPES.includes(t)) return undefined;
  return t as WalletTransactionType;
}

/** OR de caminos que enlazan un movimiento con una partida / bingo / sala. */
function buildBingoScopeOr(params: {
  roomSlug?: string;
  bingoId?: string;
  bingoRoundId?: string;
  roundSequence?: number;
}): Prisma.WalletTransactionWhereInput[] | null {
  const { roomSlug, bingoId, bingoRoundId, roundSequence } = params;

  if (bingoRoundId) {
    return [
      { cartonPurchase: { bingoRoundId } },
      { refundForCartonPurchase: { bingoRoundId } },
      { prizePayout: { playerRoundCard: { bingoRoundId } } },
    ];
  }

  const br: Prisma.BingoRoundWhereInput = {};
  if (bingoId) br.bingoId = bingoId;
  if (roundSequence != null && Number.isInteger(roundSequence)) br.sequence = roundSequence;
  if (roomSlug) {
    br.bingo = { room: { slug: roomSlug } };
  }

  if (Object.keys(br).length > 0) {
    return [
      { cartonPurchase: { bingoRound: br } },
      { refundForCartonPurchase: { bingoRound: br } },
      { prizePayout: { playerRoundCard: { bingoRound: br } } },
    ];
  }

  const bingoWhere: Prisma.BingoWhereInput = {};
  if (bingoId) bingoWhere.id = bingoId;
  if (roomSlug) bingoWhere.room = { slug: roomSlug };

  if (Object.keys(bingoWhere).length > 0) {
    return [
      { cartonPurchase: { bingoRound: { bingo: bingoWhere } } },
      { refundForCartonPurchase: { bingoRound: { bingo: bingoWhere } } },
      { prizePayout: { bingoPrize: { bingo: bingoWhere } } },
    ];
  }

  return null;
}

/**
 * Igual que el payload de `GET /player/wallet/transactions`, para reutilizar en backoffice.
 * Filtros opcionales: `type`, `roomSlug`, `bingoId`, `bingoRoundId`, `roundSequence` (requiere `bingoId`),
 * `createdAtFrom` / `createdAtTo` (fecha del movimiento).
 */
export async function listWalletTransactionsForPlayer(params: {
  playerId: string;
  limit: number;
  order: "asc" | "desc";
  createdAtFrom?: Date;
  createdAtTo?: Date;
  type?: WalletTransactionType;
  roomSlug?: string;
  bingoId?: string;
  bingoRoundId?: string;
  roundSequence?: number;
}): Promise<{ transactions: WalletTransactionRowJson[] }> {
  const {
    playerId,
    limit,
    order,
    createdAtFrom,
    createdAtTo,
    type: typeFilter,
    roomSlug,
    bingoId,
    bingoRoundId,
    roundSequence,
  } = params;

  const wallet = await prisma.wallet.findUnique({ where: { playerId } });
  if (!wallet) {
    return { transactions: [] };
  }

  const createdAtFilter: Prisma.WalletTransactionWhereInput =
    createdAtFrom || createdAtTo
      ? {
          createdAt: {
            ...(createdAtFrom ? { gte: createdAtFrom } : {}),
            ...(createdAtTo ? { lte: createdAtTo } : {}),
          },
        }
      : {};

  const andParts: Prisma.WalletTransactionWhereInput[] = [{ walletId: wallet.id }, createdAtFilter];

  if (typeFilter) {
    andParts.push({ type: typeFilter });
  }

  const scopeOr = buildBingoScopeOr({
    roomSlug: roomSlug?.trim() || undefined,
    bingoId: bingoId?.trim() || undefined,
    bingoRoundId: bingoRoundId?.trim() || undefined,
    roundSequence,
  });
  if (scopeOr?.length) {
    andParts.push({ OR: scopeOr });
  }

  const where: Prisma.WalletTransactionWhereInput =
    andParts.length === 1 ? andParts[0]! : { AND: andParts };

  const rows = await prisma.walletTransaction.findMany({
    where,
    orderBy: { createdAt: order },
    take: limit,
    include: {
      prizePayout: {
        include: {
          bingoPrize: {
            select: {
              figure: true,
              bingoId: true,
              bingo: {
                select: {
                  id: true,
                  name: true,
                  room: { select: { name: true, slug: true } },
                },
              },
            },
          },
          playerRoundCard: {
            select: {
              bingoRoundId: true,
              bingoRound: { select: { id: true, sequence: true } },
            },
          },
        },
      },
      cartonPurchase: {
        include: {
          bingoRound: {
            select: {
              id: true,
              sequence: true,
              bingoId: true,
              bingo: {
                select: {
                  id: true,
                  name: true,
                  room: { select: { name: true, slug: true } },
                },
              },
            },
          },
        },
      },
      refundForCartonPurchase: {
        include: {
          bingoRound: {
            select: {
              id: true,
              sequence: true,
              bingoId: true,
              bingo: {
                select: {
                  id: true,
                  name: true,
                  room: { select: { name: true, slug: true } },
                },
              },
            },
          },
        },
      },
      deposit: { select: { id: true, externalRef: true } },
    },
  });

  const transactions: WalletTransactionRowJson[] = rows.map((t) => {
    let detail: WalletTransactionDetailJson = { kind: null };

    if (t.prizePayout) {
      const b = t.prizePayout.bingoPrize.bingo;
      const br = t.prizePayout.playerRoundCard?.bingoRound;
      detail = {
        kind: "prize",
        roomName: b.room?.name ?? null,
        roomSlug: b.room?.slug ?? null,
        bingoId: b.id,
        bingoName: b.name,
        bingoRoundId: t.prizePayout.playerRoundCard?.bingoRoundId ?? br?.id ?? null,
        figure: t.prizePayout.bingoPrize.figure,
        roundSequence: br?.sequence ?? null,
      };
    } else if (t.refundForCartonPurchase) {
      const br = t.refundForCartonPurchase.bingoRound;
      const b = br.bingo;
      detail = {
        kind: "refund",
        roomName: b.room?.name ?? null,
        roomSlug: b.room?.slug ?? null,
        bingoId: b.id,
        bingoName: b.name,
        bingoRoundId: br.id,
        roundSequence: br.sequence,
      };
    } else if (t.cartonPurchase) {
      const br = t.cartonPurchase.bingoRound;
      const b = br.bingo;
      detail = {
        kind: "purchase",
        roomName: b.room?.name ?? null,
        roomSlug: b.room?.slug ?? null,
        bingoId: b.id,
        bingoName: b.name,
        bingoRoundId: br.id,
        roundSequence: br.sequence,
      };
    } else if (t.deposit) {
      detail = {
        kind: "deposit",
        depositId: t.deposit.id,
        depositExternalRef: t.deposit.externalRef,
        depositNote: t.deposit.externalRef,
      };
    } else if (t.type === WalletTransactionType.ADJUSTMENT) {
      detail = { kind: "adjustment" };
    }

    return {
      id: t.id,
      type: t.type,
      amountCents: t.amountCents,
      balanceAfterCents: t.balanceAfterCents,
      createdAt: t.createdAt.toISOString(),
      detail,
    };
  });

  return { transactions };
}

export { parseOptionalType, ALLOWED_TYPES };
