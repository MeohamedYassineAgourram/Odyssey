# THE LAST ORACLE

**One minute. Five days. A final hope.** An original 3D survival adventure set on an ancient Greek island threatened by a volcanic eruption. Play as Lyra, gather supplies, rescue Mira and Theron, and lead the party through five days in a sanctuary. Build a beacon before the rescue ship passes.

The island uses Three.js geometry, animated characters, lighting, particles, and an ocean shader. Google-generated portraits, textures and Lyria music accompany the game. Lyra, Mira and Theron support contextual Gemini conversations and Gradium speech. The core game and bundled assets work without provider keys; unavailable conversations use a clearly labeled local story guide.

## Run locally

Requires Node.js 22.13 or newer and a browser with WebGL support.

```bash
npm install
npm run dev
```

Open the URL printed by the server. No database is needed. For live conversations and speech, copy `.env.example` to `.env` only if it does not already exist, fill in the relevant keys, and restart the server. Preserve any existing credentials.

## Play

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move Lyra |
| Shift | Sprint while stamina lasts |
| E / interaction button | Collect supplies, rescue a companion, or enter the sanctuary |
| Drag / scroll | Orbit / zoom the camera |
| Escape / pause button | Pause or resume; Escape closes an open dialogue |
| Character portraits | Talk to Lyra or a rescued companion |
| Microphone button | Dictate a message when browser speech recognition is available |
| Speaker button | Mute or enable music and speech |
| On-screen arrows | Move on touch devices |

### Xbox controller

Pair your Xbox Wireless Controller with the computer over Bluetooth or connect it by USB. Open the game, then press and release a controller button to let the browser detect it. The connected indicator and Xbox prompts appear automatically. Press A to begin.

| Controller input | Action |
| --- | --- |
| Left stick | Move at an analog speed; navigate menus |
| Right stick | Orbit the camera; scroll open panels |
| RT / left-stick click | Sprint |
| A | Interact in the world; confirm the highlighted menu action |
| B | Close dialogue/journal or resume from pause |
| X | Talk to the selected character; start/stop dictation inside a conversation |
| Y | Reveal supplies; open/close the sanctuary journal |
| LB / RB | Select a rescued companion or Lyra; switch character in conversations |
| D-pad | Navigate choices, rations, actions, and suggested replies |
| Menu (☰) | Pause/resume; close an open dialogue |
| View | Open the controls guide |

The pause menu includes sound and credits. Suggested dialogue replies work entirely from the controller; free-form messages can use microphone dictation where available. A browser audio or microphone permission may require an initial click. The game displays an audio enable button if playback is blocked.

Stick dead zones prevent drift; action buttons activate once per press. Disconnecting pauses play. Reconnect, release held controls, and press Menu or select Continue to resume. Supported devices must expose the browser's standard Gamepad mapping. Keyboard, mouse, and touch controls remain available. Implementation follows the [standard Gamepad layout](https://w3c.github.io/gamepad/#remapping) and [browser Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).

Gather food, water, herbs and timber during the 60-second supply run. Aim for five food, five water and six timber; find Mira and Theron, then enter the glowing sanctuary before the ash arrives. Conversations pause the supply run.

At camp, make one story decision each day before resting. The whole party shares **one food and one water per night**, regardless of its size. Missing food costs 14 health and 7 hope; missing water costs 22 health and 10 hope. Two timber build one beacon stage, and one herb restores 20 health. Building and healing can be repeated while resources and their caps allow. Mira improves treatment and gathering choices; Theron improves salvage and construction choices.

**Win by surviving the fifth night with health above zero and a three-stage beacon.** Running out of health or reaching the final night without the beacon ends the journey.

## Provider settings

| Variable | Purpose | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Live character conversations; image/music generation | Local dialogue without a key |
| `GEMINI_MODEL` | Conversation model | `gemini-3.8-flash` |
| `GRADIUM_API_KEY` | Live character speech; introduction generation | Labeled browser speech fallback |
| `GRADIUM_VOICE_ID` | Gradium voice | `YTpq7expH9539ERJ` |
| `GRADIUM_MODEL` | Live speech model | `default` |
| `DEVIN_API_KEY` | Retained legacy workshop endpoint | Not connected to this game |

Keys remain on the server. `/api/status` exposes configuration flags, not credentials. Gemini replies are labeled only after a successful provider response; local dialogue and browser speech have separate labels. Google and Gradium are actively used. Cognition's legacy workshop is not connected to ORACLE, YG's offering is unidentified, and Voodoo is credited as an event host. This build does not claim technical use of every sponsor. See [sponsor details](docs/SPONSORS.md).

## Development and verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Automated tests, type checking, lint and production build passed. HTTP checks returned 200 for the page and bundled assets. Tests cover survival boundaries, immutable state, resources, request validation, provider contracts and fallbacks; they use mocked provider responses and do not spend credits. A separate live `/api/converse` request returned `source: "gemini"` and `action: "mark_supplies"`. The bundled artwork, music and introduction were generated through real provider calls on September 26, 2026. Browser visual testing was unavailable, so these checks are not a claim of completed browser playtesting.

`app/page.tsx` contains the interface, `app/oracle/` contains the world, characters, engine and survival rules, and `app/api/` contains server integrations. The application uses React, TypeScript, Three.js and vinext. Sites hosting configuration remains in `.openai/hosting.json`; publishing is managed through Sites.

To generate missing bundled assets, run `node scripts/generate-oracle-assets.mjs all`. It preserves existing files and spends provider credits only for missing selected assets. See [asset provenance and generation options](docs/ASSETS.md). Older ECHO SHIFT files remain for compatibility and are not features of the current game.

Controller validation uses simulated standard Gamepad snapshots for stick ranges, button edges, repeat timing, focus/visibility changes, and disconnect/reconnect behavior. A physical Xbox controller has not been tested in this environment.
