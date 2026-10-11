import type { Wallet } from "./online-models.ts";

export function creditUsage(wallet: Pick<Wallet, "balance" | "reserved" | "used" | "purchased">) {
  const available = Math.max(0, wallet.balance - wallet.reserved);
  const total = Math.max(0, wallet.purchased, wallet.balance + wallet.used);
  const used = Math.max(0, wallet.used);
  const percentRemaining = total > 0 ? Math.min(100, available / total * 100) : 0;
  const percentUsed = total > 0 ? Math.min(100, used / total * 100) : 0;
  return { available, total, used, percentRemaining, percentUsed };
}
