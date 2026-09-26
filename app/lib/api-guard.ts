export class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const requests = new Map<string, { count: number; reset: number }>();

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function errorResponse(error: unknown): Response {
  return error instanceof RequestError
    ? json({ error: error.message }, error.status)
    : json({ error: "The request could not be completed." }, 500);
}

// A same-origin gate prevents unrelated browser pages from spending the demo's
// provider credits. The per-isolate rate limiter is a small demo guard, not an
// account-wide quota; production hosts should also set provider spending caps.
export function guardRequest(request: Request, scope: string, limit = 24): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new RequestError("Requests must come from this game.", 403);
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RequestError("Requests must come from this game.", 403);
  }

  const now = Date.now();
  // CF-Connecting-IP is supplied by Cloudflare in production. Do not trust
  // client-provided X-Forwarded-For for this guard.
  const address = request.headers.get("cf-connecting-ip") || "local";
  const key = `${scope}:${address}`;
  const entry = requests.get(key);
  if (entry && entry.reset > now) {
    if (entry.count >= limit) throw new RequestError("Give the director a moment, then try again.", 429);
    entry.count++;
    return;
  }
  if (requests.size >= 512) {
    for (const [id, value] of requests) if (value.reset <= now) requests.delete(id);
    if (requests.size >= 512) requests.delete(requests.keys().next().value!);
  }
  requests.set(key, { count: 1, reset: now + 60_000 });
}

export async function readJson(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestError("Send application/json.", 415);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new RequestError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("A JSON request body is required.");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RequestError("Request is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let result: unknown;
  try { result = JSON.parse(text); }
  catch { throw new RequestError("The request body must be valid JSON."); }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new RequestError("The request body must be an object.");
  }
  return result as Record<string, unknown>;
}

export function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new RequestError(`${field} must contain 1–${maximum} characters.`);
  }
  return value.trim();
}
