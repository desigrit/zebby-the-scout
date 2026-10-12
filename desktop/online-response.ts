// Anthropic's structured output grammar supports fewer constraints than our
// validation schema. Keep the constraints as instructions, then validate the
// original schema locally before a result can reach the database.
export function anthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const constraints: string[] = [];
  for (const [key, value] of Object.entries(schema)) {
    if (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems"].includes(key) ||
        key === "minItems" && typeof value === "number" && value > 1) {
      constraints.push(`${key}: ${value}`);
      if (key === "minItems") result.minItems = 1;
    } else if (["properties", "$defs", "definitions"].includes(key) && value && typeof value === "object") {
      result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, anthropicSchema(child)]));
    } else if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) result[key] = anthropicSchema(value as Record<string, unknown>);
    else if (["anyOf", "allOf", "oneOf"].includes(key) && Array.isArray(value)) result[key] = value.map(anthropicSchema);
    else result[key] = value;
  }
  if (schema.type === "object") result.additionalProperties = false;
  if (constraints.length) result.description = [schema.description, `Required constraints: ${constraints.join(", ")}.`].filter(Boolean).join(" ");
  return result;
}

export function validStructuredResult(schema: Record<string, unknown>, value: unknown): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>, properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
    if (Array.isArray(schema.required) && schema.required.some((key) => !(key in object))) return false;
    return Object.entries(object).every(([key, child]) => properties[key]
      ? validStructuredResult(properties[key], child) : schema.additionalProperties !== false);
  }
  if (schema.type === "array") return Array.isArray(value) &&
    !(typeof schema.minItems === "number" && value.length < schema.minItems) &&
    !(typeof schema.maxItems === "number" && value.length > schema.maxItems) &&
    (!schema.items || value.every((item) => validStructuredResult(schema.items as Record<string, unknown>, item)));
  if (schema.type === "string") return typeof value === "string" &&
    !(typeof schema.minLength === "number" && value.length < schema.minLength) &&
    !(typeof schema.maxLength === "number" && value.length > schema.maxLength);
  if (schema.type === "integer" || schema.type === "number") return typeof value === "number" && Number.isFinite(value) &&
    (schema.type !== "integer" || Number.isInteger(value)) &&
    !(typeof schema.minimum === "number" && value < schema.minimum) && !(typeof schema.maximum === "number" && value > schema.maximum);
  if (schema.type === "boolean") return typeof value === "boolean";
  return schema.type !== "null" || value === null;
}

export class OnlineAnalysisError extends Error {
  readonly diagnostic: string;
  constructor(message: string, diagnostic: string) { super(message); this.name = "OnlineAnalysisError"; this.diagnostic = diagnostic; }
}

export function providerFailure(provider: string, model: string, thinking: string, response: Response, payload: unknown, billingOwner: "user" | "zebby" = "user") {
  const body = payload && typeof payload === "object" ? payload as { error?: { message?: unknown; type?: unknown; code?: unknown }; request_id?: unknown } : {};
  const raw = typeof body.error?.message === "string" ? body.error.message.toLowerCase() : "";
  const status = response.status;
  // Only classify the message. Never echo arbitrary provider text, submitted
  // resume content, keys or response bodies in the UI or diagnostic logs.
  const type = typeof body.error?.type === "string" && /^[a-z_]{1,60}$/.test(body.error.type) ? body.error.type : "unknown";
  const candidateId = response.headers.get("request-id") || response.headers.get("x-request-id") || body.request_id;
  const requestId = typeof candidateId === "string" && /^(?:req_[a-zA-Z0-9_-]{8,100}|[a-f0-9-]{32,36})$/.test(candidateId) ? candidateId : "unavailable";
  let reason: string, category: string;
  if (status === 401) { category = "authentication"; reason = "did not accept the API key. Replace it in Settings."; }
  else if (status === 402 || /credit balance|insufficient.*(?:credit|balance|fund|quota)|spend.*limit|usage.*limit/.test(raw) || body.error?.code === "insufficient_quota") {
    category = "billing"; reason = "has no available API credit or its spending limit was reached. Check Billing in your API account.";
  } else if (status === 403) { category = "permission"; reason = "denied access. Check this key's workspace and model permissions."; }
  else if (status === 404) { category = "model"; reason = "could not find the selected model. Choose another model in Settings."; }
  else if (status === 413 || /context length|too many tokens|prompt is too long|request too large/.test(raw)) {
    category = "input-size"; reason = "could not accept this much text. Shorten the job description or resume and try again.";
  } else if (status === 429) { category = "rate-limit"; reason = "reached an API rate or usage limit. Wait and retry, or check your API limits."; }
  else if (status === 529 || status === 503) { category = "overloaded"; reason = "is busy. Try again shortly."; }
  else if (status === 408 || status === 504) { category = "timeout"; reason = "timed out. Try again or choose a lower thinking level."; }
  else if (status >= 500) { category = "service"; reason = "had a service error. Try again shortly."; }
  else if (status === 400 && /schema|output_config.*format|json_schema/.test(raw)) {
    category = "schema"; reason = "rejected the response format. Update Zebby, or try another model and report the issue.";
  } else if (status === 400 && /thinking|effort|budget_tokens|max_tokens/.test(raw)) {
    category = "thinking"; reason = "does not support this thinking configuration. Choose another thinking level or model.";
  } else { category = "request"; reason = "rejected the analysis request. Try another model or report the issue with your logs."; }
  if (billingOwner === "zebby" && ["authentication", "billing", "permission"].includes(category)) {
    reason = "is unavailable through Zebby credits. Try again later or report this issue to Zebby.";
  }
  if (billingOwner === "zebby" && category === "rate-limit") reason = "reached the current analysis limit. Wait and try again.";
  return new OnlineAnalysisError(`${provider} ${reason}`,
    `provider=${provider}, model=${model}, thinking=${thinking}, status=${status}, category=${category}, type=${type}, request=${requestId}`);
}
