# TROY 120 sponsor integrations

Google and Gradium have generated bundled assets through real provider calls. A configured key, saved asset, and successful live conversation are distinct states. Local dialogue and browser speech are labeled separately. Browser speech recognition supplies microphone input; it is separate from Gemini’s interpretation and Gradium’s spoken replies.

| Sponsor | Current use | Evidence / limits |
| --- | --- | --- |
| Google DeepMind / Gemini | Contextual Troy dialogue and validated companion orders; new Troy cover; retained portraits, sky, marble, and Lyria music | Generated files and manifests are bundled. On September 26, 2026, a real `/api/troy/converse` request returned `source: gemini`, correctly recognized first-house materials, and requested `mark_supplies`. A later live campaign request correctly described Stage 2, The Amber Oasis, its 30 plots/four landmarks, and XP sources. Mocked contract and fallback tests also pass. |
| Gradium | New Troy introduction; live speech through `/api/voice` | Bundled Troy narration is a 12.24-second WAV generated with `default`. Live replies depend on availability. |
| Cognition / Devin | Retained guarded `/api/workshop` adapter | Not connected to Troy; retained code does not establish active integration. |
| Voodoo | Event host acknowledgement | No runtime service integration claimed. |
| YG | Event partner acknowledgement | Identity, technical offering, and access remain unconfirmed. No integration claimed. |

The request to use every sponsor is **not fully met**. Google and Gradium have active technical roles; the other partners are credited without implying an unconnected integration.

## Active integrations

**Gemini:** `POST /api/troy/converse` accepts Lyra, Theron, or Mira; a player message; bounded history; and validated phase, time, health, materials, building/mission counts, kills, selected blueprint, expedition stage, seed, explored caches, owned weapons, and equipped weapon. It calls Gemini Interactions with `store: false`, low thinking, and a JSON schema. Replies contain at most 300 characters, action `none` or `mark_supplies`, and an optional companion command. Markers are allowed only during play when supplies are requested. Invalid or unavailable replies fall back to the labeled local city guide.

The command whitelist is **`fight`, `build`, or `follow`**, addressed to Theron or Mira. A build command names a valid house, timber yard, cannon tower, or temple. Provider output must match the server’s deterministic interpretation of an explicit affirmative order; questions, advice requests, negations, unknown actions, and commands outside the playing phase do not execute. The local fallback supports the same orders without a Gemini key. Commands queue while dialogue pauses the game. After resume, companions move and fight or find empty plots and build using the player’s actual materials. Replies cannot directly award resources, heal, finish contracts, spawn buildings, alter scores, or change the deadline.

Y on a controller or T on the keyboard opens the paused voice call and starts browser speech recognition when available. The transcript sends automatically when the player finishes speaking. Typed input and suggested orders provide a fallback when recognition or microphone access is unavailable. This browser input is not a Gradium transcription integration. Gradium voices the resulting response. The confirmation offers a return-to-city action; companions act only after the player resumes.

Lyra is the founder, Theron the architect and melee helper, and Mira the healer and bow helper. Both companions can construct requested blueprints. Advice follows current city layouts, campaign progression, construction costs, mission rewards, enemy types, the three-weapon loadout, and the two-minute deadline, with gentle horse foreshadowing. Previous eruption, sanctuary, and multi-day mechanics do not apply.

The conversation default is `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. Images use `gemini-3.1-flash-image`; retained music uses `lyria-3-clip-preview`. See the [Troy manifest](../public/troy/manifest.json) and [reused asset manifest](../public/oracle/manifest.json).

**Gradium:** `POST /api/voice` requests WAV speech with `only_audio: true`, validates it, and returns audio. Missing/unavailable service produces an explicit unavailable response; the UI can use labeled browser speech. The saved Troy introduction uses Gradium; music comes from Lyria. Muting stops voice playback. New cannon, projectile, weapon, loot, and companion animations are procedural Three.js gameplay visuals, not additional provider-generated assets.

Keys remain server-side. Optional voice settings are `GRADIUM_VOICE_ID` and `GRADIUM_MODEL`. `/api/status` exposes configuration booleans only. Local development uses ignored `.env`; hosted keys belong in Sites runtime secrets.

## Retained Cognition adapter

The ECHO SHIFT workshop can create a Devin session with a maximum of 1 ACU, a constrained mission schema, and no attached knowledge or secrets. Polling uses a signed, expiring HttpOnly session cookie. Its hovercraft prompt and schema have not been adapted to Troy, which exposes no workshop UI.

## References

- User-provided [Gemini skills](https://github.com/google-gemini/gemini-skills) and [cookbook](https://github.com/google-gemini/cookbook).
- Official [Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [image generation](https://ai.google.dev/gemini-api/docs/image-generation), and [Lyria](https://ai.google.dev/gemini-api/docs/music-generation).
- Official [Gradium speech REST guide](https://docs.gradium.ai/guides/text-to-speech-rest).
- Official Devin [create-session](https://docs.devin.ai/api-reference/v1/sessions/create-a-new-devin-session) and [retrieve-session](https://docs.devin.ai/api-reference/v1/sessions/retrieve-details-about-an-existing-session).
- [Hackathon event listing](https://luma.com/par-hack).
