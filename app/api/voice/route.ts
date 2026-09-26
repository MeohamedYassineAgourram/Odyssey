import { boundedText, errorResponse, guardRequest, json, readJson } from "../../lib/api-guard";
import { serverEnv } from "../../lib/server-env";
import { normalizeCompletedWav } from "../../lib/wav.js";

// Finished director lines use the official one-shot REST endpoint.
// https://docs.gradium.ai/guides/text-to-speech-rest
export async function POST(request: Request) {
  try {
    guardRequest(request, "voice");
    const body = await readJson(request);
    const text = boundedText(body.text, "text", 320);
    const apiKey = serverEnv("GRADIUM_API_KEY");
    if (!apiKey) {
      return json({ error: "Gradium voice is not configured.", source: "unavailable" }, 503);
    }
    try {
      const response = await fetch("https://api.gradium.ai/api/post/speech/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          text,
          voice_id: serverEnv("GRADIUM_VOICE_ID") || "YTpq7expH9539ERJ",
          model_name: serverEnv("GRADIUM_MODEL") || "default",
          output_format: "wav",
          only_audio: true,
        }),
      });
      if (!response.ok) throw new Error("Gradium request failed.");
      const audio = await response.arrayBuffer();
      const signature = new TextDecoder().decode(audio.slice(0, 12));
      if (audio.byteLength < 44 || audio.byteLength > 8_000_000 || !signature.startsWith("RIFF") || !signature.endsWith("WAVE")) {
        throw new Error("Gradium returned invalid audio.");
      }
      normalizeCompletedWav(new Uint8Array(audio));
      return new Response(audio, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
          "X-Voice-Source": "gradium",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return json({ error: "Gradium voice is temporarily unavailable.", source: "unavailable" }, 503);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
