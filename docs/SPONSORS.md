# ECHO SHIFT sponsor integrations

ECHO SHIFT is a playable 3D browser game with optional server-side AI services. Its core hovercraft gameplay works without provider credentials. A configured integration and a successfully completed provider call are different states: a missing key or failed request must never be described as a live sponsor response.

| Sponsor | Role in this project | What is required |
| --- | --- | --- |
| Google DeepMind / Gemini | A natural-language game director selects a supported world event and writes a short response using constrained JSON output. | `GEMINI_API_KEY`. Without it, an explicitly labeled local director runs. |
| Gradium | Generates the director's spoken response as WAV audio through its official text-to-speech REST endpoint. | `GRADIUM_API_KEY`; optional voice and model settings. Any browser voice fallback is browser speech, not Gradium. |
| Cognition / Devin | An optional workshop creates one mission brief and event through a real, asynchronous Devin session. Each requested session has a maximum of 1 ACU. | `DEVIN_API_KEY`, available credits, and an explicit workshop action. No session starts automatically. |
| Voodoo | Event co-host and reference for a short, readable arcade loop, replayability, and progression. | No Voodoo runtime integration is claimed. Public publishing materials describe partner/mobile tooling; a public browser SDK was not established. Ask the event team for any hackathon-specific offering. |
| YG | Acknowledged event partner. | The official event listing gives only the unlinked name “YG.” Its identity, API, and event resources remain unverified. Supply the sponsor's official resource before implementing an integration. |

The project therefore has three real API adapters, with live operation dependent on credentials. It does **not** claim that all five sponsors have functioning technology integrations.

## Configure provider access

Copy `.env.example` to the ignored `.env` file for local development. For a Sites deployment, configure the corresponding server-side runtime secrets through Sites. Do not expose provider keys in browser code or variables prefixed with `NEXT_PUBLIC_`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini developer API key | Unconfigured |
| `GEMINI_MODEL` | Model for structured director responses | `gemini-3.8-flash` |
| `GRADIUM_API_KEY` | Gradium API key | Unconfigured |
| `GRADIUM_VOICE_ID` | Voice catalogue identifier | `YTpq7expH9539ERJ` |
| `GRADIUM_MODEL` | Gradium speech model | `default` |
| `DEVIN_API_KEY` | Cognition personal or service API key | Unconfigured |

Restart local development after changing environment values. `/api/status` reports configuration flags without returning secrets. Obtain sponsor credits and keys through the hackathon's official process; this repository does not contain any credits or credentials.

No provider credentials were supplied during implementation, so live authenticated calls and account-specific access could not be verified. Local validation covers unavailable-provider behavior, input limits, output validation, and workshop session authorization. Verify each enabled provider with your event credentials before presenting it as live.

## Integration behavior

**Gemini:** `/api/director` validates the player's short instruction and game context. The server calls the Interactions API with a JSON schema. Responses are restricted to supported events: `calm`, `storm`, `riches`, `turbo`, and `repair`. The local fallback remains clearly distinguishable from a Gemini response. Interactions are requested with storage disabled.

**Gradium:** `/api/voice` submits the completed line to `https://api.gradium.ai/api/post/speech/tts` with `only_audio: true` and `output_format: "wav"`. The server validates that the response resembles a WAV file before returning audio. A missing or unavailable provider yields an explicit unavailable response.

**Cognition:** `POST /api/workshop` accepts `{ "brief": "A storm race through the floating ruins" }`. It starts one Devin session with `max_acu_limit: 1`, an output schema, and empty `knowledge_ids` and `secret_ids`. This avoids attaching configured organizational knowledge or secrets. The prompt requests mission data only. A returned session identifier is authorized using a signed, expiring HttpOnly cookie. `GET /api/workshop?sessionId=...` can retrieve only that browser's current authorized session, not an arbitrary Devin session. It returns a validated mission after completion. Sessions can take time, exhaust the limit, or become blocked; the session link allows the creator to inspect the result in Devin. Creating a new workshop session replaces that browser's polling authorization for the old session.

The 1 ACU value caps each session; it is not an account-wide budget. The endpoints include same-origin checks and a small per-runtime rate limiter. Keep the hackathon deployment private or add persistent user authentication and quotas before offering funded AI calls publicly. Configure provider spending limits appropriate to the available credits.

## Sources used

- [User-provided Gemini skills repository](https://github.com/google-gemini/gemini-skills), specifically [gemini-api-dev/SKILL.md](https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-api-dev/SKILL.md).
- [User-provided Gemini cookbook](https://github.com/google-gemini/cookbook), particularly the [JSON mode quickstart](https://github.com/google-gemini/cookbook/blob/main/quickstarts/JSON_mode.ipynb).
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) and [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview).
- [Gradium text-to-speech REST guide](https://docs.gradium.ai/guides/text-to-speech-rest).
- [Devin create-session reference](https://docs.devin.ai/api-reference/v1/sessions/create-a-new-devin-session) and [retrieve-session reference](https://docs.devin.ai/api-reference/v1/sessions/retrieve-details-about-an-existing-session).
- [Voodoo publishing](https://voodoo.io/publishing) and [developer platform terms](https://voodoo.io/terms-platform).
- [Official hackathon listing and sponsor names](https://luma.com/par-hack).

These references were consulted for this build on September 26, 2026. API models, access terms, and event offerings can change.
