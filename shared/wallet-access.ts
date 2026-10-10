import { z } from "zod";

export const deviceTokenSchema = z.string().regex(/^zby_device_[a-f0-9]{64}$/);
export const recoveryCodeSchema = z.string().max(100).transform((value) => value.replace(/\s/g, "").toUpperCase())
  .pipe(z.string().regex(/^ZEBBY-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/, "Paste your Zebby recovery code."));
export const pairingCodeSchema = z.string().max(30).transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, "Enter the pairing code from your other computer."));
export const deviceNameSchema = z.string().trim().min(1).max(80).refine((value) => !/[\x00-\x1f\x7f]/.test(value));
export const guestSessionSchema = z.object({ walletId: z.string().uuid(), deviceId: z.string().uuid() });
export const walletAccessSchema = z.object({ hasRecoveryCode: z.boolean(), recoveryVersion: z.string().uuid().nullable(), devices: z.array(z.object({
  id: z.string().uuid(), name: deviceNameSchema, createdAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }), current: z.boolean(),
})).max(20) });
export const pairingSchema = z.object({ code: pairingCodeSchema, expiresAt: z.string().datetime({ offset: true }) });
export type WalletAccess = z.infer<typeof walletAccessSchema>;
export type WalletPairing = z.infer<typeof pairingSchema>;
