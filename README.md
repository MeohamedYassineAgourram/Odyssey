# TROY 120

**Build a city. Defy the odds. Trust no horse.** A 3D city-building survival campaign. Explore larger cities, complete changing contracts, fight escalating sieges, and build as much as possible in two minutes. Survive to advance to a new city; earn permanent XP even in defeat.

Three.js powers the city, animated characters, three equipable weapons, cannon projectiles, companion actions, ocean, lighting, and four horse finales. Gemini supplies contextual conversations and generated artwork; Lyria supplies bundled music; Gradium supplies narration and live speech. The game and bundled assets work without provider keys, with labeled local advice when live dialogue is unavailable.

## Run locally

Requires Node.js 22.13 or newer and a browser with WebGL support.

```bash
npm install
npm run dev
```

Open the printed URL. The development server provides a local Cloudflare D1 database for campaign progress. Tables initialize on first use; deployed Sites provisions the configured `DB` binding and applies the bundled Drizzle migration. For live conversations and speech, copy `.env.example` to `.env` only if it does not already exist, fill in the relevant keys, and restart. Preserve existing credentials.

## Build your Troy

Each run starts with **120 seconds, 100 health, 3 timber, 2 stone, and 0 bronze**. Approach one of 30 empty plots across five districts and press **A or E** to open its building dashboard. The clock pauses while you review four building cards, your materials, costs, and effects. Select an affordable card and confirm with A or a click; B or Escape returns to the city. Timber and stone deposits provide 3 units; bronze provides 2. Deposits replenish after 7 seconds.

The play view keeps the city visible with a compact timer, health and stamina, minimap, weapon belt, and contextual actions. Construction choices appear at the selected plot. Contracts, supplies, ranks, controls, sound, and credits are available through the pause menus.

| Building | Timber / stone / bronze | Renown | Effect |
| --- | --- | --- | --- |
| Trojan house | 3 / 1 / 0 | 100 | Affordable construction |
| Timber yard | 2 / 2 / 0 | 140 | Produces 1 timber every 8 seconds |
| Cannon tower | 3 / 3 / 1 | 230 | Aims and fires visible shells at nearby raiders; impacts deal area damage |
| Temple of Troy | 4 / 4 / 2 | 400 | Restores 4 health every 8 seconds, up to 100 |

Eight core contracts plus two rotating bonus contracts reward construction, gathering, combat, and exploration. Each pays fixed materials and renown automatically, exactly once. Your first house returns 4 timber, 3 stone, and 1 bronze plus 60 contract points.

Stage one has six scheduled raids, starting at 18 seconds and repeating every 20 seconds. Skirmishers rush, brutes absorb more hits and strike harder, and archers telegraph aimed projectiles. Later stages shorten raid intervals toward 10 seconds and increase damage, health, and numbers, with difficulty capped at stage 12 and at most 18 active enemies. Use the sword for quick strikes, the bow for ranged attacks, and the hammer for slower heavy hits and knockback. Dodge every 1.8 seconds and use cannon towers for support. Weapon and tower damage increases at stage five to match stronger enemies. Bow arrows and arcing cannon shells resolve damage on contact or impact; defeated raiders fall and fade, leaving glowing weapon drops. Every defeated raider earns 35 points, including tower and companion kills. Zero health ends the run immediately; its renown is not banked.

You begin with a sword. Collect drops with A or E to unlock and equip a bow or hammer. The three-slot weapon belt shows owned equipment; switch with LB/RB, Q/R, or its buttons. Unlocks save with each completed run, including defeat, and are available in later expeditions. Collecting a duplicate does not add another slot.

Press **Y or T** to pause and call a companion. The microphone starts automatically when supported; say “Theron, fight the raiders,” “Mira, build houses,” or “follow me.” Speech sends when you finish talking. Typed messages and suggested orders remain available when microphone access is unavailable or declined. Confirmed orders wait until you return to the city. Theron fights up close, Mira provides bow cover, and either can follow or construct buildings. Builders walk to empty plots, spend your actual materials at completion, and wait when supplies are insufficient.

At the deadline, the Trojan horse always destroys Troy in one of four nine-second finales. Survive to bank building, contract, and combat points plus a **200-point survival bonus**. The next city starts empty. Best score, banked total, completed runs, city stage, discovered endings, weapon unlocks, XP, and rank are stored in D1. Signed-in Sites visitors use their platform identity; anonymous/local visitors use an HttpOnly profile cookie. Clearing that anonymous cookie loses access to its profile. The next run excludes the previous selected disaster. Conversations, building choices, menus, and pausing stop the clock and combat simulation.

## Cities and ranks

Each city spans 100 × 86 world units, roughly five times the old playable area. Five districts contain 30 building plots and 15 replenishing deposits. Four outer landmark caches each award materials, 75 renown, and 35 XP. The map marks plots, resources, undiscovered caches, and typed enemies.

Survival advances the stage and cycles through The Sapphire Coast, The Amber Oasis, The Emerald Vale, and The Stormbound Heights. Each has a distinct street plan, palette, and landmarks. Seeds mirror and offset districts between attempts; higher stages continue increasing difficulty until its cap. Defeat keeps the current stage and resets the city, while preserving earned XP and collected weapon unlocks after the completed run saves.

XP is awarded after every completed attempt: 15 per building, 8 per enemy, 25 per contract, 35 per landmark, and 150 for survival. Recruit, Bronze, Silver, Gold, Platinum, and Diamond each have three divisions; Immortal is the final rank. The first promotion is at 300 XP and Immortal begins at 36,000. This is personal progression, not a competitive matchmaking rating.

`GET /api/troy/progress` loads the campaign; `POST` saves one completed run. Server validation recomputes rewards, and atomic run receipts prevent duplicate XP or stage advances on retries. The result screen waits for a successful save and offers retry on connection failure. Two simultaneous clears cannot advance the same stage twice. The game is client-simulated; this is not an anti-cheat system or public leaderboard.

## Controls

| Keyboard / mouse / touch | Action |
| --- | --- |
| WASD / arrow keys | Move Lyra |
| Shift | Sprint while stamina lasts |
| E / interaction button | Gather, collect loot, open a nearby plot’s building dashboard, or call an advisor |
| F / Space | Attack with the equipped weapon |
| C | Dodge |
| Q / R / weapon belt buttons | Switch owned weapons |
| T | Pause and start a voice call to the nearby advisor, or Theron |
| Tab | Open city contracts |
| Drag / scroll | Orbit / zoom |
| Escape | Pause/resume; go back from dialogue or building choices |
| Microphone / pause-menu sound button | Start/stop voice input / toggle sound |
| On-screen arrows and action buttons | Touch movement, interaction, and combat |

### Xbox controller

Pair by Bluetooth or connect by USB, then press and release a button for browser detection. The indicator and Xbox prompts appear automatically. Press A to begin.

| Input | Action |
| --- | --- |
| Left stick | Move; navigate menus |
| Right stick | Orbit; scroll panels |
| RT / left-stick click | Sprint |
| A | Gather/collect/interact; open a plot dashboard; confirm its highlighted building card or menu action |
| X | Attack with the equipped weapon; start/stop microphone input in conversations |
| B | Dodge during play; go back from building choices/dialogue or resume from pause |
| Y | Pause and call the nearby advisor, or Theron; automatically start the microphone |
| LB / RB | Switch owned weapons during play; switch character in conversations |
| D-pad up | Open contracts |
| D-pad | Navigate menus and suggested replies |
| Menu | Pause/resume; close dialogue |
| View | Open controls |

Navigate building cards and suggested orders with the D-pad or left stick, then confirm with A. Voice calls use browser speech recognition and send the transcript automatically when speech finishes; X or Y controls the microphone while a conversation is open. If speech recognition or microphone permission is unavailable, choose a suggested order or type a message. Companion orders begin only after returning to play. Browser audio or microphone permission may require an initial click. The interface offers an enable-sound button when playback is blocked.

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

Keys remain server-side. `/api/status` reports configuration flags, not proof of a successful call. `/api/troy/converse` accepts bounded Troy context and history. Both Gemini and the local fallback can provide advice, reveal deposits, or queue a validated `fight`, `build`, or `follow` order for Theron or Mira. Commands must match an explicit affirmative request; questions and negations do not issue orders. The API does not directly grant resources, healing, score, buildings, or time. The game engine executes accepted orders after resume and enforces normal construction costs and combat rules. Google and Gradium power this build; other partners are acknowledged without claiming technical integration. See [sponsor details](docs/SPONSORS.md).

## Development and verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover the city economy, changing contracts, XP/rank boundaries, SQLite saves and duplicate retries, map reachability, all biome/finale combinations, weapon inventory and model ownership, cannon aiming/recoil and cleanup, combat deaths, deadline boundaries, API validation, and mocked provider contracts and fallbacks. Provider tests spend no credits. Controller tests use simulated standard Gamepad snapshots. These checks do not establish completed browser playtesting or physical Xbox controller testing.

`app/page.tsx` contains the UI; `app/troy/` contains the city, engine, configuration, and rules. Reusable character models and controller support remain under `app/oracle/`. The app uses React, TypeScript, Three.js, and vinext. Sites hosting configuration is in `.openai/hosting.json`.

New cover art and narration under `public/troy/` were generated through real Google and Gradium calls on September 26, 2026. `node scripts/generate-troy-assets.mjs` generates only missing Troy cover/narration files and spends provider credits. Retained portraits, sky, marble, and Lyria music are reused. See [asset provenance](docs/ASSETS.md). Older ORACLE survival routes and ECHO SHIFT resources remain compatibility code; their gameplay is not part of TROY 120.
