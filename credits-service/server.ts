import { createServer } from "node:http";
import { serviceConfig } from "./config.ts";
import { createService, ServiceError } from "./service.ts";
import { ZodError } from "zod";
const config = serviceConfig(), service = createService(config);
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  const controller = new AbortController();
  response.on("close", () => { if (!response.writableEnded) controller.abort(); });
  try {
    const path = new URL(request.url || "/", config.publicUrl).pathname;
    if (request.headers.origin && request.headers.origin !== config.publicUrl) throw new ServiceError("Origin not allowed.", 403);
    if (request.method === "GET" && ["/checkout/return", "/checkout/cancel"].includes(path)) {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
      response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zebby</title><style>body{margin:12vh auto;padding:24px;max-width:540px;font:16px system-ui;background:#f8f6f3;color:#302c29}h1{color:#a64a34}</style><h1>Return to Zebby</h1><p>${path.endsWith("cancel") ? "Checkout was cancelled. Your credits have not changed." : "Zebby will show your credits once payment is confirmed."}</p><p>You can close this tab.</p></html>`); return;
    }
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of request) { size += chunk.length; if (size > 512000) throw new ServiceError("Request is too large.", 413); chunks.push(chunk); }
    const raw = Buffer.concat(chunks);
    const result = path === "/v1/stripe/webhook" && request.method === "POST"
      ? await service.webhook(raw, String(request.headers["stripe-signature"] || ""))
      : await service.handle(request.method || "GET", path, raw.length ? JSON.parse(raw.toString("utf8")) : undefined,
        String(request.headers.authorization || "").replace(/^Bearer /, ""), controller.signal, request.socket.remoteAddress);
    response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(result));
  } catch (error) {
    if (response.destroyed) return;
    response.statusCode = error instanceof ServiceError ? error.status : error instanceof ZodError || error instanceof SyntaxError ? 400 : 503;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: error instanceof ServiceError ? error.message : response.statusCode === 400
      ? "Check the supplied information and try again." : "Analysis or payment is temporarily unavailable. Try again shortly." }));
    // Never log request bodies, resumes, auth codes, tokens, or provider responses.
    if (response.statusCode === 503) console.error("Credits request failed", { path: request.url?.split("?")[0], type: error instanceof Error ? error.name : "unknown" });
  }
});
server.requestTimeout = 30000; server.headersTimeout = 15000;
server.listen(config.port, "0.0.0.0", () => console.info(`Zebby credits service listening on ${config.port}, ${config.live ? "live" : "test"} mode`));
const cleanup = setInterval(() => { void service.cleanup().catch(() => console.error("Credit hold cleanup failed")); }, 60000);
cleanup.unref(); void service.cleanup().catch(() => console.error("Credit hold cleanup failed"));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { clearInterval(cleanup); server.close(); });
