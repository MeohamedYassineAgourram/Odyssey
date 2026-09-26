# TROY 120 sponsor integrations

Google and Gradium have generated bundled assets through real provider calls. A configured key, saved asset, and successful live conversation are distinct states. Local dialogue and browser speech are labeled separately. Browser speech recognition supplies microphone input; it is separate from Gemini’s interpretation and Gradium’s spoken replies.

| Sponsor | Current use | Evidence / limits |
| --- | --- | --- |
| Google DeepMind / Gemini | Contextual Troy dialogue and validated companion orders; new Troy cover; retained portraits, sky, marble, and Lyria music | Generated files and manifests are bundled. On September 26, 2026, a real `/api/troy/converse` request returned `source: gemini`, correctly recognized first-house materials, and requested `mark_supplies`. A later live campaign request correctly described Stage 2, The Amber Oasis, its 30 plots/four landmarks, and XP sources. Mocked contract and fallback tests also pass. |
| Gradium | Lyra’s opening mission briefing; live speech through `/api/voice` | The active bundled briefing is a 9.5-second WAV generated with `default` and adjusted locally to 1.22× tempo while preserving pitch. Live replies depend on availability. |
| Cognition / Devin | Retained guarded `/api/workshop` adapter | Not connected to Troy; retained code does not establish active integration. |
| Voodoo | Event host acknowledgement | No runtime service integration claimed. |
| YG | Event partner acknowledgement | Identity, technical offering, and access remain unconfirmed. No integration claimed. |

The request to use every sponsor is **not fully met**. Google and Gradium have active technical roles; the other partners are credited without implying an unconnected integration.

## Active integrations

**Gemini:** `POST /api/troy/converse` accepts Lyra, Theron, or Mira; a player message; bounded history; and validated phase, time, health, materials, building/mission counts, kills, selected blueprint, expedition stage, seed, explored caches, owned weapons, equipped weapon, and Warlord status. It calls Gemini Interactions with `store: false`, low thinking, and a JSON schema. Replies contain at most 300 characters, action `none` or `mark_supplies`, and an optional companion command. Markers are allowed only during play when supplies are requested. Invalid or unavailable replies fall back to the labeled local city guide.

The command whitelist is **`fight`, `build`, or `follow`**, addressed to Theron or Mira. A build command names a valid house, timber yard, cannon tower, or temple. Provider output must match the server’s deterministic interpretation of an explicit affirmative order; questions, advice requests, negations, unknown actions, and commands outside the playing phase do not execute. The local fallback supports the same orders without a Gemini key. Commands queue while dialogue pauses the game. After resume, companions move and fight or find empty plots and build using the player’s actual materials. Replies cannot directly award resources, heal, finish contracts, spawn buildings, alter scores, or change the deadline.

Y on a controller or T on the keyboard opens the paused voice call and starts browser speech recognition when available. The transcript sends automatically when the player finishes speaking. Typed input and suggested orders provide a fallback when recognition or microphone access is unavailable. This browser input is not a Gradium transcription integration. Gradium voices the resulting response. The confirmation offers a return-to-city action; companions act only after the player resumes.

Lyra is the founder, Theron the architect and melee helper, and Mira the healer and bow helper. Both companions can construct requested blueprints. Advice follows current city layouts, campaign progression, construction costs, mission rewards, tougher raids, the three-weapon loadout, and the two-minute deadline, with gentle horse foreshadowing. The Achaean Warlord arrives at 30 seconds remaining and must be defeated before time runs out; only then can surviving the horse finale advance the campaign. Failed attempts preserve earned XP and collected weapons. Each enemy death has a 28% weapon-drop chance. Spawn timing, drop rolls, combat damage, and the city-clear decision belong to the game engine and validated rules, not the dialogue provider. Previous eruption, sanctuary, and multi-day mechanics do not apply.

The conversation default is `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. Images use `gemini-3.1-flash-image`; retained music uses `lyria-3-clip-preview`. See the [Troy manifest](../public/troy/manifest.json) and [reused asset manifest](../public/oracle/manifest.json).

**Gradium:** `POST /api/voice` requests WAV speech with `only_audio: true`, validates it, and returns audio. Missing/unavailable service produces an explicit unavailable response; the UI can use labeled browser speech. Each run plays the saved 9.5-second `briefing.wav` once, without a new provider call. The matching paragraph appears for the first 10 active game seconds, including when muted. Briefing playback pauses and resumes with the game; an NPC voice call cancels it. The older 12.24-second `intro.wav` remains an asset but is no longer played. The [briefing manifest](../public/troy/briefing-manifest.json) records the exact text, generation details, WAV format, and local tempo adjustment. Music comes from Lyria. Muting stops voice playback. New cannon, projectile, weapon, loot, and companion animations are procedural Three.js gameplay visuals, not additional provider-generated assets.

The opening screen presents Xbox and Keyboard control tabs. Menu or Escape opens a pause screen with the same controls inline. Exit to main menu ends an active attempt and saves earned XP and collected weapons; exiting an already-won horse finale finalizes the victory and its rewards first. These gameplay and onboarding behaviors do not imply completed browser playtesting or physical controller testing.

Keys remain server-side. Optional voice settings are `GRADIUM_VOICE_ID` and `GRADIUM_MODEL`. `/api/status` exposes configuration booleans only. Local development uses ignored `.env`; hosted keys belong in Sites runtime secrets.

## Retained Cognition adapter

The ECHO SHIFT workshop can create a Devin session with a maximum of 1 ACU, a constrained mission schema, and no attached knowledge or secrets. Polling uses a signed, expiring HttpOnly session cookie. Its hovercraft prompt and schema have not been adapted to Troy, which exposes no workshop UI.

## References

- User-provided [Gemini skills](https://github.com/google-gemini/gemini-skills) and [cookbook](https://github.com/google-gemini/cookbook).
- Official [Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [image generation](https://ai.google.dev/gemini-api/docs/image-generation), and [Lyria](https://ai.google.dev/gemini-api/docs/music-generation).
- Official [Gradium speech REST guide](https://docs.gradium.ai/guides/text-to-speech-rest).
- Official Devin [create-session](https://docs.devin.ai/api-reference/v1/sessions/create-a-new-devin-session) and [retrieve-session](https://docs.devin.ai/api-reference/v1/sessions/retrieve-details-about-an-existing-session).
- [Hackathon event listing](https://luma.com/par-hack).
