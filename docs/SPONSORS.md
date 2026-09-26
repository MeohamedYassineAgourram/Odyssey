# THE LAST ORACLE sponsor integrations

Google and Gradium have completed real provider calls for this game. A configured key, saved generated asset and successful live reply are distinct states. The interface labels local dialogue and browser speech fallbacks; they are not presented as sponsor responses.

| Sponsor | Current use | Verified status |
| --- | --- | --- |
| Google DeepMind / Gemini | Contextual conversations with Lyra, Mira and Theron; six generated images; two original Lyria music tracks | Generated assets are bundled. A live `/api/converse` request returned `source: "gemini"` and `action: "mark_supplies"`. |
| Gradium | Generated opening narration and live speech through `/api/voice` | The bundled introduction is a validated 12.24-second WAV generated with `default`. Live speech depends on provider availability. |
| Cognition / Devin | A guarded legacy `/api/workshop` create/poll adapter remains in the repository | No supplied key and no connection to the ORACLE interface. It does not count as an active game integration. |
| Voodoo | Event host acknowledgement | No runtime service integration is claimed. |
| YG | Event partner acknowledgement | Its identity, technical offering and access details remain unconfirmed. No integration is claimed. |

The requirement to use every sponsor is therefore **not fully met**. The remaining sponsor details and Cognition access were requested; they have not been supplied. Credits acknowledge those partners without implying technology use.

## Active integrations

**Gemini:** `POST /api/converse` accepts a character, player message, bounded conversation history and current game context. The server calls the Gemini Interactions API with `store: false`, low thinking and a JSON response schema. Replies contain up to 300 characters, an emotion, and either `none` or `mark_supplies`. Supply markers are allowed only during scavenging; conversation cannot grant resources or alter survival rules. Malformed or unavailable provider responses use the labeled local story guide.

The default conversation model is `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. Bundled images use `gemini-3.1-flash-image`; music uses `lyria-3-clip-preview`. These generated assets load without live credentials. Their prompts and generation records are in the [asset manifest](../public/oracle/manifest.json).

**Gradium:** `POST /api/voice` sends completed dialogue to the official speech REST endpoint with WAV output and `only_audio: true`. It validates the response before returning audio. Missing or unavailable service produces an explicit unavailable response, and the interface can use labeled browser speech. The saved introduction uses the same provider; music comes from Lyria. Muting stops voice playback.

`GEMINI_API_KEY` and `GRADIUM_API_KEY` stay in server-only environment settings. Optional speech settings are `GRADIUM_VOICE_ID` and `GRADIUM_MODEL`. `/api/status` returns configuration booleans, not evidence that a call succeeded. Local development uses an ignored `.env`; hosted credentials belong in Sites runtime secrets.

## Retained Cognition adapter

The previous ECHO SHIFT workshop can create a Devin session with a maximum of 1 ACU, a constrained mission schema, and no attached knowledge or secrets. Polling is authorized with a signed, expiring HttpOnly session cookie. Its hovercraft mission prompt and event schema have not been adapted to ORACLE, and the new game exposes no workshop UI. Merely retaining this code is not evidence of Cognition use for the current game.

## References

- User-provided [Google Gemini skills repository](https://github.com/google-gemini/gemini-skills) and [Gemini API development skill](https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-api-dev/SKILL.md).
- User-provided [Google Gemini cookbook](https://github.com/google-gemini/cookbook), including its [JSON mode quickstart](https://github.com/google-gemini/cookbook/blob/main/quickstarts/JSON_mode.ipynb).
- Official [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [image generation](https://ai.google.dev/gemini-api/docs/image-generation), and [Lyria music generation](https://ai.google.dev/gemini-api/docs/music-generation).
- Official [Gradium speech REST guide](https://docs.gradium.ai/guides/text-to-speech-rest).
- Official Devin [create-session](https://docs.devin.ai/api-reference/v1/sessions/create-a-new-devin-session) and [retrieve-session](https://docs.devin.ai/api-reference/v1/sessions/retrieve-details-about-an-existing-session) references for the retained adapter.
- [Hackathon event listing](https://luma.com/par-hack).
