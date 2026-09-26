import { boundedText, errorResponse, guardRequest, json, readJson, RequestError } from "../../lib/api-guard";
import { serverEnv } from "../../lib/server-env";
import {
  cleanText, missionPrompt, missionSchema, parseMission, safeSessionUrl,
  signSession, validSessionId, verifySession,
} from "../../lib/workshop";

const COOKIE_NAME = "echo_workshop";
const DEVIN_API = "https://api.devin.ai/v1/sessions";
const SESSION_LIFETIME = 60 * 60 * 1000;

function apiKey(): string {
  const key = serverEnv("DEVIN_API_KEY");
  if (!key) throw new RequestError("Cognition workshop is unavailable. Add a server-side DEVIN_API_KEY to enable it.", 503);
  return key;
}

function sessionCookie(request: Request): string {
  return request.headers.get("cookie")?.split(";")
    .map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1) || "";
}

async function devinRequest(path: string, key: string, body?: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new RequestError("Cognition did not respond in time. Please try again shortly.", 504);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new RequestError("The configured Cognition key could not access the workshop.", 503);
    }
    if (response.status === 402 || response.status === 429) {
      throw new RequestError("Cognition credits or capacity are currently unavailable.", 503);
    }
    if (response.status === 404) throw new RequestError("This Cognition session is no longer available.", 404);
    throw new RequestError("Cognition could not complete this request.", 502);
  }
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new RequestError("Cognition returned an unreadable response.", 502); }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new RequestError("Cognition returned an invalid response.", 502);
  }
  return result as Record<string, unknown>;
}

export async function POST(request: Request): Promise<Response> {
  try {
    guardRequest(request, "workshop-create", 3);
    const key = apiKey();
    const body = await readJson(request, 2048);
    const brief = cleanText(boundedText(body.brief, "Mission brief", 600), 600);
    if (!brief) throw new RequestError("Write a short mission brief first.");
    const previous = await verifySession(sessionCookie(request), key);
    if (previous && Date.now() - previous.createdAt < 60_000) {
      throw new RequestError("Your mission is already being designed. Wait one minute before requesting another.", 429);
    }

    const result = await devinRequest(DEVIN_API, key, {
      prompt: missionPrompt(brief),
      title: "ECHO SHIFT · one playable mission",
      max_acu_limit: 1,
      unlisted: true,
      knowledge_ids: [],
      secret_ids: [],
      structured_output_schema: missionSchema,
    });
    if (!validSessionId(result.session_id)) {
      throw new RequestError("Cognition did not return a valid session.", 502);
    }
    const session = {
      sessionId: result.session_id,
      url: safeSessionUrl(result.url),
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_LIFETIME,
    };
    const response = json({ sessionId: session.sessionId, url: session.url, status: "working" });
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    response.headers.set("Set-Cookie", `${COOKIE_NAME}=${await signSession(session, key)}; HttpOnly; SameSite=Strict; Path=/api/workshop; Max-Age=3600${secure}`);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    guardRequest(request, "workshop-poll", 24);
    const key = apiKey();
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!validSessionId(sessionId)) throw new RequestError("A valid mission session is required.");
    const session = await verifySession(sessionCookie(request), key);
    if (!session || session.sessionId !== sessionId) {
      throw new RequestError("This mission belongs to another browser session or has expired.", 403);
    }

    const result = await devinRequest(`${DEVIN_API}/${encodeURIComponent(sessionId)}`, key);
    const state = result.status_enum;
    const status = state === "finished" ? "finished"
      : state === "expired" ? "expired"
        : state === "blocked" || state === "suspend_requested" || state === "suspend_requested_frontend" ? "blocked"
          : "working";
    let output = result.structured_output;
    if (typeof output === "string" && output.length <= 4096) {
      try { output = JSON.parse(output); } catch { output = null; }
    }
    const mission = parseMission(output);
    if (status === "finished" && !mission) {
      return json({ status: "failed", url: session.url, error: "Cognition finished without a playable mission. Check the session for details." });
    }
    return json({ status, url: session.url, ...(status === "finished" && mission ? { mission } : {}) });
  } catch (error) {
    return errorResponse(error);
  }
}
