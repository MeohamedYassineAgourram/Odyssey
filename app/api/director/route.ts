import { boundedText, errorResponse, guardRequest, json, readJson, RequestError } from "../../lib/api-guard";
import { type DirectorContext, geminiDirector, isDirectorEvent, localDirector } from "../../lib/director";
import { serverEnv } from "../../lib/server-env";

export async function POST(request: Request) {
  try {
    guardRequest(request, "director");
    const body = await readJson(request);
    const message = boundedText(body.message, "message", 240);
    const context: DirectorContext = {};
    if (body.context !== undefined) {
      if (!body.context || typeof body.context !== "object" || Array.isArray(body.context)) {
        throw new RequestError("context must be an object.");
      }
      const raw = body.context as Record<string, unknown>;
      for (const field of ["shards", "shield", "timeLeft", "score"] as const) {
        const value = raw[field];
        if (value !== undefined) {
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
            throw new RequestError(`context.${field} must be a valid nonnegative number.`);
          }
          context[field] = value;
        }
      }
      if (raw.event !== undefined) {
        if (!isDirectorEvent(raw.event)) throw new RequestError("Unknown game event.");
        context.event = raw.event;
      }
    }
    const apiKey = serverEnv("GEMINI_API_KEY");
    if (!apiKey) return json(localDirector(message, context, "Gemini key is not configured; using the local director."));
    try {
      return json(await geminiDirector(apiKey, serverEnv("GEMINI_MODEL") || "gemini-3.8-flash", message, context));
    } catch {
      return json(localDirector(message, context, "Gemini is temporarily unavailable; using the local director."));
    }
  } catch (error) {
    return errorResponse(error);
  }
}
