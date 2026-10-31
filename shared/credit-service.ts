export const CREDIT_SERVICE_URL = "https://zebby-credits-9d5bde.westus2.cloudapp.azure.com";
export const LEGACY_CREDIT_SERVICE_URL = "https://zebby-credits.onrender.com";

// These two operator-controlled hosts use the same Supabase wallet ledger.
// Keep its original storage origin so an older installer can still read the
// encrypted wallet after a rollback. No other origin can receive its token.
export function walletStorageOrigin(origin: string): string {
  return origin === CREDIT_SERVICE_URL ? LEGACY_CREDIT_SERVICE_URL : origin;
}
