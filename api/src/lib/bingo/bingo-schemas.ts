import { z } from "zod";
import {
  BingoDrawMode,
  BingoFigure,
  BingoPrizeMode,
  BingoStatus,
  BingoType,
  PrizePayoutMode,
} from "@prisma/client";

export const prizeSchema = z.object({
  figure: z.nativeEnum(BingoFigure),
  amount: z.union([z.string(), z.number()]),
  uniquePerRound: z.boolean().optional().default(true),
});

export const baseBingoBodySchema = z.object({
  roomId: z.string().min(1),
  name: z.string().min(1).max(200),
  status: z.nativeEnum(BingoStatus).optional(),
  bingoType: z.nativeEnum(BingoType),
  startDateTime: z.string().datetime(),
  endDateTime: z.union([z.string().datetime(), z.null()]).optional(),
  repeatEveryMinutes: z.number().int().min(1).max(10_080).optional().nullable(),
  cardPrice: z.union([z.string(), z.number()]),
  prizeMode: z.nativeEnum(BingoPrizeMode).optional(),
  prizePoolSeed: z.union([z.string(), z.number()]).optional(),
  minPlayersToStart: z.number().int().min(1).max(100_000).default(2),
  prizePayoutMode: z.nativeEnum(PrizePayoutMode).optional(),
  drawMode: z.nativeEnum(BingoDrawMode).optional(),
  prizes: z.array(prizeSchema).min(1),
});

export const createBingoSchema = baseBingoBodySchema.extend({
  endDateTime: z.string().datetime(),
  repeatEveryMinutes: z.number().int().min(1).max(10_080),
});

export const updateBingoSchema = baseBingoBodySchema.partial().extend({
  roomId: z.string().min(1).optional(),
  prizes: z.array(prizeSchema).min(1).optional(),
});

export type PrizeBody = z.infer<typeof prizeSchema>;
