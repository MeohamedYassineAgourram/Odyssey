# Echo Shift

**The world listens.** A 3D browser game made for the {Tech: Europe} AI Gaming Hack in Paris. Pilot a hovercraft through floating ocean ruins, collect 12 energy shards, and survive a 90-second expedition. Tell the director what you want to happen: a storm, more shards, a speed boost, calmer waters, or a shield repair.

The game is playable without API keys. It clearly labels its local director; live Gemini, Gradium voice, and Cognition missions activate when their server credentials are configured.

The bundled mission library contains three briefs generated with Gemini. An optional generated sky adds atmosphere behind the live 3D world, and bundled Gradium briefings play when sound is enabled. These saved resources work without calling a provider during a flight. Their provenance is documented in [assets](docs/ASSETS.md).

## Run locally

Requires Node.js 22.13 or newer and a browser with WebGL support.

```bash
npm install
```

Copy `.env.example` to `.env` if `.env` does not already exist, then add any provider keys you want to enable. Keep existing credentials when updating an environment file. Restart development after editing it.

```bash
npm run dev
```

Open the local URL printed by the server. No database is required. The best score is stored only in the current browser.

## Play

- **A / D** or **left / right arrows:** steer between lanes.
- **Space:** hold to boost while energy is available.
- **P / Escape:** pause or resume. Leaving the window also pauses a run.
- **Touch controls:** steer and boost using the on-screen buttons.
- **Director:** send a short request or choose a prompt to change the world.
- **Missions & controls:** launch Still Tide, Gale Front, or Crystal Bloom. Each starts with its named world modifier for 15 seconds, followed by the usual expedition. Saved mission lines are labeled **GEMINI MISSION**, separately from the live director.
- **Voice:** enable narration; microphone input uses available browser speech recognition.
- **Cognition workshop:** explicitly request an asynchronous custom mission, then apply it when ready. Each request may spend up to 1 ACU from your Devin account.

Finish the full expedition with at least 12 shards and some shield remaining. Obstacles damage the shield. Start another expedition to beat your browser's best score.

## Sponsor services

| Variable | Enables | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google DeepMind / Gemini live director | Local director without a key |
| `GEMINI_MODEL` | Gemini model override | `gemini-3.8-flash` |
| `GRADIUM_API_KEY` | Gradium spoken director lines | Voice provider unavailable without a key |
| `GRADIUM_VOICE_ID` | Gradium voice | `YTpq7expH9539ERJ` |
| `GRADIUM_MODEL` | Gradium model | `default` |
| `DEVIN_API_KEY` | Cognition / Devin mission workshop | Disabled without a key |

Keys stay on the server. Configure deployed credentials as Sites runtime secrets. `/api/status` reports whether credentials are configured, never their values. Provider errors fall back to the labeled local director or show an unavailable state; they are not represented as successful AI responses. Browser speech fallback is labeled separately from Gradium.

Gemini model access, mission and sky generation, a live director request, and Gradium mission voice generation were verified with the supplied server credentials on September 26, 2026. The bundled mission library loads saved JSON and audio directly.

Voodoo is credited as the event co-host and arcade design reference. YG is credited as an event partner; its identity and API were not established from the event resources. The project does not claim a live technical integration with either. See [sponsor integration details and official sources](docs/SPONSORS.md).

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The API tests compile the small server modules into a temporary directory and exercise game outcomes, validation, deterministic fallback, and mocked Gemini/Gradium responses. They do not spend credits. Live authenticated provider calls require your event credentials and remain a separate verification step.

To deliberately regenerate the saved Gemini resources with your configured key, run `node scripts/generate-resources.mjs missions`, `sky`, or `all`. This spends Google API credits and writes the validated output and its provenance manifest. Generation is never part of the normal build or gameplay.

Run `node scripts/generate-voice.mjs` to regenerate the three saved Gradium mission briefings after changing the mission pack. It spends Gradium credits and records the voice and exact text in a separate manifest.

Built with React, TypeScript, Three.js, and vinext on Cloudflare Workers. `app/page.tsx` contains the interface, `app/game/` contains the 3D engine and rules, and `app/api/` contains the server integrations. `.openai/hosting.json` and the Sites Vite plugin preserve the deployment setup. `npm run start` serves a production build; publishing is managed through Sites.
