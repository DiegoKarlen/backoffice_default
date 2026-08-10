import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { httpError, zodFlattenError } from "../lib/route-helpers.js";
import {
  listBackofficePaymentMethods,
  setPaymentMethodActive,
} from "../payments/payment-method.service.js";

export const paymentMethodsRouter = Router();
paymentMethodsRouter.use(requireAuth);

const patchSchema = z.object({
  active: z.boolean(),
});

paymentMethodsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const paymentMethods = await listBackofficePaymentMethods();
    res.json({ paymentMethods });
  }),
);

paymentMethodsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) throw httpError(400, "id required");

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw zodFlattenError(parsed.error);

    try {
      const paymentMethod = await setPaymentMethodActive(id, parsed.data.active);
      res.json({ paymentMethod });
    } catch {
      throw httpError(404, "Payment method not found");
    }
  }),
);
