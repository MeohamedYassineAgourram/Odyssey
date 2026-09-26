# TROY 120

**Build a city. Defy the odds. Trust no horse.** A two-minute 3D city-building action game. Begin with empty plots, complete contracts to fund construction, fight raiders, and build as much of Troy as you can before the bell.

Three.js powers the city, animated characters, combat, ocean, lighting, and four horse finales. Gemini supplies contextual conversations and generated artwork; Lyria supplies bundled music; Gradium supplies narration and live speech. The game and bundled assets work without provider keys, with labeled local advice when live dialogue is unavailable.

## Run locally

Requires Node.js 22.13 or newer and a browser with WebGL support.

```bash
npm install
npm run dev
```

Open the printed URL. No database is needed. For live conversations and speech, copy `.env.example` to `.env` only if it does not already exist, fill in the relevant keys, and restart. Preserve existing credentials.

## Build your Troy

Each run starts with **120 seconds, 100 health, 3 timber, 2 stone, and 0 bronze**. Select a blueprint, approach one of 12 empty plots, and interact. Timber and stone deposits provide 3 units; bronze provides 2. Deposits replenish after 7 seconds.

| Building | Timber / stone / bronze | Renown | Effect |
| --- | --- | --- | --- |
| Trojan house | 3 / 1 / 0 | 100 | Affordable construction |
| Timber yard | 2 / 2 / 0 | 140 | Produces 1 timber every 8 seconds |
| Watchtower | 3 / 3 / 1 | 230 | Automatically shoots nearby raiders |
| Temple of Troy | 4 / 4 / 2 | 400 | Restores 4 health every 8 seconds, up to 100 |

Eight contracts reward construction, collecting from three deposits, and defeating three raiders. Each pays fixed materials and renown automatically, exactly once. Your first house returns 4 timber, 3 stone, and 1 bronze plus 60 contract points.

Strike nearby enemies, dodge their attack warnings, and use watchtowers for support. Every defeated raider earns 35 points, including tower kills. Zero health ends the run immediately; its score is not banked.

At the deadline, the Trojan horse always destroys Troy in one of four nine-second finales. Survive to bank building, contract, and combat points plus a **200-point survival bonus**. The next city starts empty. Best score, banked total, completed runs, and discovered endings persist in this browser. The next run excludes the previous selected disaster. Conversations, menus, and pausing stop the clock.

## Controls

| Keyboard / mouse / touch | Action |
| --- | --- |
| WASD / arrow keys | Move Lyra |
| Shift | Sprint while stamina lasts |
| E / interaction button | Gather, build, or speak to a nearby advisor |
| F / Space | Strike nearby raiders |
| C | Dodge |
| Q / R / blueprint buttons | Select a building |
| T | Talk to Lyra |
| Tab | Open city contracts |
| Drag / scroll | Orbit / zoom |
| Escape | Pause/resume; close dialogue |
| Microphone / speaker buttons | Dictation / sound |
| On-screen arrows and action buttons | Touch movement, interaction, and combat |

### Xbox controller

Pair by Bluetooth or connect by USB, then press and release a button for browser detection. The indicator and Xbox prompts appear automatically. Press A to begin.

| Input | Action |
| --- | --- |
| Left stick | Move; navigate menus |
| Right stick | Orbit; scroll panels |
| RT / left-stick click | Sprint |
| A | Gather/build/interact; confirm highlighted menu action |
| X | Attack; start/stop dictation in conversations |
| B | Dodge; close dialogue or resume from pause |
| Y | Talk to the nearby advisor, or Lyra |
| LB / RB | Change blueprint; switch character in conversations |
| D-pad up | Open contracts |
| D-pad | Navigate menus and suggested replies |
| Menu | Pause/resume; close dialogue |
| View | Open controls |

Suggested replies work from the controller. Free-form dictation requires browser speech recognition. Browser audio or microphone permission may require an initial click. The interface offers an enable-sound button when playback is blocked.

Stick dead zones prevent drift; actions activate once per press. Disconnecting pauses play. Reconnect, release held controls, then press Menu or select Continue. Controllers must expose the standard browser Gamepad mapping. Keyboard, mouse, and touch remain available.

## Provider settings

| Variable | Purpose | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Live conversations; asset-generation scripts | Local dialogue without a key |
| `GEMINI_MODEL` | Conversation model | `gemini-3.8-flash` |
| `GRADIUM_API_KEY` | Live speech; narration generation | Labeled browser speech fallback |
| `GRADIUM_VOICE_ID` | Gradium voice | `YTpq7expH9539ERJ` |
| `GRADIUM_MODEL` | Live speech model | `default` |
| `DEVIN_API_KEY` | Retained legacy workshop endpoint | Not connected to Troy |

Keys remain server-side. `/api/status` reports configuration flags, not proof of a successful call. `/api/troy/converse` accepts bounded Troy context and history; replies can provide text or reveal deposits. Dialogue cannot grant resources or change health, score, buildings, or time. Google and Gradium power this build; other partners are acknowledged without claiming technical integration. See [sponsor details](docs/SPONSORS.md).

## Development and verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover immutable construction and economy, exact mission rewards, production, combat deaths, ending selection, deadline/finale boundaries, API validation, and mocked provider contracts and fallbacks. Provider tests spend no credits. Controller tests use simulated standard Gamepad snapshots. These checks do not establish completed browser playtesting or physical Xbox controller testing.

`app/page.tsx` contains the UI; `app/troy/` contains the city, engine, configuration, and rules. Reusable character models and controller support remain under `app/oracle/`. The app uses React, TypeScript, Three.js, and vinext. Sites hosting configuration is in `.openai/hosting.json`.

New cover art and narration under `public/troy/` were generated through real Google and Gradium calls on September 26, 2026. `node scripts/generate-troy-assets.mjs` generates only missing Troy cover/narration files and spends provider credits. Retained portraits, sky, marble, and Lyria music are reused. See [asset provenance](docs/ASSETS.md). Older ORACLE survival routes and ECHO SHIFT resources remain compatibility code; their gameplay is not part of TROY 120.
