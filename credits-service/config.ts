export type ServiceConfig = { supabaseUrl: string; supabaseKey: string; publicUrl: string; stripeKey: string;
  stripeWebhookSecret: string; openaiKey: string; anthropicKey: string; live: boolean; port: number };
export function serviceConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  function required(key: string) { const value = env[key]?.trim(); if (!value) throw new Error(`Set ${key} before starting the credits service.`); return value; }
  function https(value: string) { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Service URLs must use HTTPS."); return url.origin; }
  const stripeKey = required("STRIPE_SECRET_KEY"), live = env.ZEBBY_ALLOW_LIVE_PAYMENTS === "true";
  if (!(live ? stripeKey.startsWith("sk_live_") : stripeKey.startsWith("sk_test_"))) throw new Error("Stripe must use test mode unless live payments are explicitly enabled.");
  return { supabaseUrl: https(required("SUPABASE_URL")), supabaseKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    publicUrl: https(required("ZEBBY_PUBLIC_SERVICE_URL")), stripeKey, stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    openaiKey: env.OPENAI_API_KEY || "", anthropicKey: env.ANTHROPIC_API_KEY || "", live, port: Number(env.PORT || 8080) };
}
