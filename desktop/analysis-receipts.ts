import type { DatabaseSync } from "node:sqlite";
import type { AnalysisReceipt } from "../shared/chatgpt-plan.ts";

// Additive metadata is ignored by older Zebby versions and does not change user_version.
export function ensureAnalysisReceipts(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS analysis_receipts (job_id TEXT PRIMARY KEY, digest TEXT NOT NULL, target TEXT NOT NULL, applied_at TEXT NOT NULL)");
}
export function hasAnalysisReceipt(db: DatabaseSync, receipt: AnalysisReceipt | undefined, target: string) {
  if (!receipt) return false;
  if (!/^[\da-f]{64}$/.test(receipt.id) || receipt.digest !== receipt.id) throw new Error("The analysis receipt is invalid.");
  ensureAnalysisReceipts(db);
  const saved = db.prepare("SELECT digest,target FROM analysis_receipts WHERE job_id=?").get(receipt.id);
  if (saved && (saved.digest !== receipt.digest || saved.target !== target)) throw new Error("This analysis belongs to another record.");
  return Boolean(saved);
}
export function recordAnalysisReceipt(db: DatabaseSync, receipt: AnalysisReceipt | undefined, target: string) {
  if (!receipt) return;
  if (!hasAnalysisReceipt(db, receipt, target)) db.prepare("INSERT INTO analysis_receipts(job_id,digest,target,applied_at) VALUES(?,?,?,?)")
    .run(receipt.id, receipt.digest, target, new Date().toISOString());
}
