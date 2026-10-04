import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyStripeEvent(body: Buffer, signature: string, secret: string, now = Date.now()) {
  const parts = signature.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error("Invalid webhook signature.");
  const expected = createHmac("sha256", secret).update(timestamp + ".").update(body).digest();
  const matched = parts.some(([key, value]) => key === "v1" && /^[a-f\d]{64}$/i.test(value || "") && timingSafeEqual(expected, Buffer.from(value, "hex")));
  if (!matched) throw new Error("Invalid webhook signature.");
  return JSON.parse(body.toString("utf8"));
}
export async function stripeRequest(key: string, path: string, fields?: URLSearchParams, idempotency?: string, send = fetch) {
  const response = await send(`https://api.stripe.com/v1/${path}`, { method: fields ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}) }, body: fields?.toString(), signal: AbortSignal.timeout(20000) });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error("Payment provider is unavailable. Try again shortly.");
  return data;
}
