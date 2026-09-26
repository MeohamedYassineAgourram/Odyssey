# 🏛️ TROY 120

Play as Lyra and build Troy in **two minutes**: gather supplies, complete missions, and fight raiders. Move with **left stick / WASD**, build with **A / E**, and attack with **X / F**. Defeat the boss who arrives with **30 seconds left** before time runs out. Even victory ends with the Trojan Horse destroying your city, but your XP and collected weapons carry into the next attempt.

**Build a city. Defy the odds. Trust no horse.**

A 3D browser game built for the **{Tech: Europe} AI Gaming Hack in Paris**, combining city building, survival combat, and companions you can talk to.

🎮 [Play TROY 120](https://troy-120.vercel.app) · [Gameplay screenshots](#-quick-demo) · [Run locally](#-running-the-project) · [Full gameplay guide](docs/GAMEPLAY.md)

Open the game in your browser and start playing—no account required. Xbox controllers and keyboard controls are supported.

<p align="center">
  <a href="docs/screenshots/01-title-screen.png">
    <img src="docs/screenshots/01-title-screen.png" alt="TROY 120 title screen with Play Troy and the keyboard and Xbox control guides" width="900" />
  </a>
  <br />
  <em>The opening screen: choose your control guide and start building Troy.</em>
</p>

## 🎮 How to Play

View the **Xbox** or **Keyboard** guide on the opening screen, then select **Play Troy**. Lyra explains the mission during the first ten seconds. Build as much as you can to earn renown, defend yourself, and defeat the Warlord before the countdown ends.

| Action | Xbox controller | Keyboard / mouse |
| --- | --- | --- |
| Move | Left stick | WASD / arrow keys |
| Look around | Right stick | Drag the mouse |
| Sprint | RT / left-stick click | Shift |
| Gather, collect loot, or open building choices | A | E |
| Attack | X | F / Space |
| Dodge | B | C |
| Switch weapons | LB / RB | Q / R |
| Talk to a companion | Y | T |
| View missions | D-pad up | Tab |
| Pause, see controls, or exit | Menu | Escape |

Connect an Xbox controller by USB or Bluetooth, then press and release a button for browser detection. Use the D-pad or left stick to select menu items, **A** to confirm, and **B** to go back.

Building choices, conversations, and pause menus stop the clock. If the microphone is unavailable, type a message or choose a suggested order.

## 🧰 Technologies

- **Game and interface:** `Three.js`, `React 19`, `TypeScript`, `Tailwind CSS`
- **Application and hosting:** `Next.js`, `Vercel`; `vinext`, `Vite`, and `Sites` for the original Cloudflare build
- **Campaign storage:** private `Vercel Blob` on Vercel; `Cloudflare D1` / `SQLite` and `Drizzle ORM` on Sites
- **AI conversations and artwork:** `Google Gemini`
- **Music and voices:** `Google Lyria`, `Gradium`
- **Browser input:** `Gamepad API`, browser speech recognition

## ✨ Features

Here is what TROY 120 can do:

- **🏗️ Build your city:** Choose houses, timber yards, cannon towers, or temples. Complete contracts to earn materials and keep expanding.

- **⚔️ Survive the siege:** Fight skirmishers, archers, and brutes. Dodge their attacks and face the Achaean Warlord in the final thirty seconds.

- **🏹 Collect your loadout:** Some defeated enemies drop weapons. Start with a sword and unlock a bow and heavy hammer, with a maximum of three weapon types.

- **💥 Defend with cannons:** Towers aim, fire visible shells, and damage raiders when those shells land.

- **🗣️ Command your companions:** Say “Theron, fight the raiders” or “Mira, build houses.” They carry out accepted orders when play resumes, using the same resources and combat rules as the rest of the game.

- **🌍 Explore changing cities:** Progress through four city themes with different layouts, landmarks, and increasingly difficult raids, up to a difficulty cap.

- **🏆 Keep growing:** Earn XP and climb from Recruit to Immortal. Completed attempts save XP and weapon unlocks even after defeat; clearing a city also banks renown and advances the campaign.

- **🐴 Expect the inevitable:** Even victory ends with Troy’s destruction. Four horse finales make the last moments unpredictable before your next city begins.

## 🧪 The Process

The game revolves around one short loop: **gather → build → defend → survive → rebuild**. The two-minute deadline makes each choice matter, while permanent XP and weapon unlocks give every completed attempt a purpose.

Three.js creates the playable city, characters, buildings, and combat effects. Gemini-generated artwork and Lyria music are bundled with the project, alongside Lyra’s Gradium opening briefing. Live Gemini conversations and Gradium replies add character interaction when provider keys are configured.

Companion dialogue connects to a limited set of game actions: fight, build, or follow. The game validates those orders and applies normal costs. Campaign saves use server validation and duplicate-run protection so retrying a save does not award XP twice.

## 📚 What I Learned

- **🎯 Short rounds need variety:** Different cities, enemy roles, weapon choices, and finales give players more decisions within the same time limit.
- **🎮 Controls are part of onboarding:** A simple guide on both the opening and pause screens helps players start quickly and recover when they forget a button.
- **🗣️ AI needs clear boundaries:** Conversations feel useful when companions can perform specific, understandable actions within the game’s rules.
- **💾 Progress needs reliable saves:** Persistent rewards matter only when completed runs save correctly, including retries after connection failures.

## 🚧 How It Can Be Improved

- Add more city themes, contracts, bosses, and enemy attack patterns.
- Expand companion personalities and tactical orders.
- Playtest difficulty and accessibility with more players and physical controllers.
- Explore cooperative play and shared city defense.

## 🎬 Quick Demo

Explore the game through these gameplay screenshots. Click any image to view it at full size.

### 1. Start your expedition

Review the mission and rules, then start a run. Lyra’s short briefing introduces your objective as you explore the empty plots and nearby supplies.

<p align="center">
  <a href="docs/screenshots/02-mission-and-rules.png">
    <img src="docs/screenshots/02-mission-and-rules.png" alt="Mission and rules panel explaining construction, survival, the Warlord deadline, and companion orders" width="900" />
  </a>
  <br />
  <em>The mission and rules explain how to build, survive, and call for help.</em>
</p>

<p align="center">
  <a href="docs/screenshots/03-gameplay-start.png">
    <img src="docs/screenshots/03-gameplay-start.png" alt="Lyra and her companions at the start of a run, with empty building plots, resources, the countdown, and minimap" width="900" />
  </a>
  <br />
  <em>Your city starts with empty plots, scattered supplies, and two minutes on the clock.</em>
</p>

### 2. Build your first house

Walk to an empty plot and press **A / E**. Choose a Trojan house. Completing the first building contract rewards more supplies for your next construction.

<p align="center">
  <a href="docs/screenshots/04-build-menu.png">
    <img src="docs/screenshots/04-build-menu.png" alt="Paused building menu with Trojan house, timber yard, cannon tower, and Temple of Troy choices and their material costs" width="900" />
  </a>
  <br />
  <em>Compare building costs and effects while the clock is paused.</em>
</p>

<p align="center">
  <a href="docs/screenshots/05-house-built.png">
    <img src="docs/screenshots/05-house-built.png" alt="A completed Trojan house standing on a plot beside Lyra and her companions" width="900" />
  </a>
  <br />
  <em>The first house turns an empty plot into the beginning of your city.</em>
</p>

### 3. Call for help

Press **Y / T** and ask a companion to fight or build. Speak, type, or choose a suggested order, then resume the game to let your companion act.

<p align="center">
  <a href="docs/screenshots/06-call-companion.png">
    <img src="docs/screenshots/06-call-companion.png" alt="Theron's companion panel with suggested fight and build orders, a microphone, and a text input" width="900" />
  </a>
  <br />
  <em>Call Theron for help; the city stays paused during the conversation.</em>
</p>

### 4. Defend the city

Watch the minimap for approaching raiders. Attack with **X / F**, dodge with **B / C**, and use your buildings and companions to hold them back.

<p align="center">
  <a href="docs/screenshots/07-raiders-approach.png">
    <img src="docs/screenshots/07-raiders-approach.png" alt="Two raiders pursuing Lyra through the city as enemy markers appear on the minimap" width="900" />
  </a>
  <br />
  <em>Raiding parties interrupt your building plans and force you to keep moving.</em>
</p>

<p align="center">
  <a href="docs/screenshots/08-combat-at-the-gates.png">
    <img src="docs/screenshots/08-combat-at-the-gates.png" alt="Lyra fighting raiders near the city gates, with a red attack warning, an approaching hammer brute, and the wooden horse beyond the gate" width="900" />
  </a>
  <br />
  <em>Combat near the gates: dodge attack warnings and watch for tougher enemies.</em>
</p>

### 5. Complete contracts

Press **D-pad up / Tab** to review your objectives. Building, fighting, and exploring complete contracts that automatically award materials and renown.

<p align="center">
  <a href="docs/screenshots/09-contracts.png">
    <img src="docs/screenshots/09-contracts.png" alt="City contracts panel listing building and combat objectives, completion counts, and resource rewards" width="900" />
  </a>
  <br />
  <em>Contracts give your next construction or battle a concrete reward.</em>
</p>

### 6. Pause and check your controls

Press **Menu / Escape** to pause. Review the Xbox or keyboard controls, resume play, or exit to the main menu and save your earned XP and collected weapons.

<p align="center">
  <a href="docs/screenshots/10-pause-menu.png">
    <img src="docs/screenshots/10-pause-menu.png" alt="Pause menu displaying keyboard controls, Xbox tab, Resume game, and Exit to main menu" width="900" />
  </a>
  <br />
  <em>The pause screen keeps controls and exit options close at hand.</em>
</p>

### 7. Learn, return, and conquer

If Lyra falls, review the result and try again. Completed attempts retain earned XP and collected weapons, so your campaign can keep growing after defeat.

<p align="center">
  <a href="docs/screenshots/11-game-over.png">
    <img src="docs/screenshots/11-game-over.png" alt="Defeat screen showing the run's score breakdown, campaign rank and XP, and options to retry or return to the main menu" width="900" />
  </a>
  <br />
  <em>The defeat screen summarizes the attempt and lets you return with a new plan.</em>
</p>

To clear a city, defeat the Warlord who arrives with **0:30 remaining** before the clock reaches **0:00**, and stay alive. The horse finale then destroys the city, your victory saves, and the next expedition opens with your accumulated XP and weapons.

## 🏗️ Architecture

| Layer | Role |
| --- | --- |
| React interface | Start and pause menus, controls, HUD, dialogue, building choices |
| Three.js game engine | City generation, movement, combat, companions, animations |
| Server API routes | Dialogue validation, voice requests, campaign saves |
| Private Vercel Blob / Cloudflare D1 | XP, ranks, weapon unlocks, scores, and city progression, using the storage for each host |
| Bundled media | Cover art, portraits, textures, music, and opening narration |

## 🔌 API Overview

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/troy/progress` | Load the current campaign |
| POST | `/api/troy/progress` | Validate and save a completed attempt once |
| POST | `/api/troy/converse` | Get contextual dialogue and validated companion orders |
| POST | `/api/voice` | Generate a spoken reply with Gradium |
| GET | `/api/status` | Report which provider keys are configured |

## 🚀 Running the Project

### Prerequisites

- **Node.js 22.13 or newer** and npm
- A browser with **WebGL** support
- Optional: an Xbox controller, microphone, and provider API keys

### Installation

```bash
git clone https://github.com/MeohamedYassineAgourram/Odyssey.git
cd Odyssey
npm install
npm run dev
```

Open the URL printed in your terminal. The development server provides a local D1 database and initializes campaign tables on first use.

### Optional live AI

The core game and bundled media work without provider keys. For live AI conversations and spoken replies, copy `.env.example` to `.env` **only if `.env` does not already exist**, then set:

```dotenv
GEMINI_API_KEY=your_google_api_key
GRADIUM_API_KEY=your_gradium_api_key
```

Restart the development server after editing the file. Keys stay on the server, and `.env` is ignored by Git. Without configured providers, the game offers local dialogue and browser speech fallbacks. Microphone transcription depends on browser support.

### Development checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover gameplay rules, progression, saves, API contracts, and simulated controller input. They do not replace physical controller playtesting.

## 📁 Project Structure

```text
app/
├── page.tsx             # Game interface and menus
├── globals.css          # Visual styling
├── troy/                # City, rules, combat, progression, and controls
├── oracle/              # Shared character models and controller support
└── api/                 # Campaign, dialogue, voice, and provider routes
db/                      # Database schema and campaign persistence
drizzle/                 # Database migrations
public/
├── troy/                # Troy cover and narration
└── oracle/              # Shared portraits, textures, and music
scripts/                 # Asset generation and development utilities
tests/                   # Automated checks
docs/                    # Gameplay, integrations, and asset provenance
```

## 🤝 Hackathon Partners

Built for the **{Tech: Europe} AI Gaming Hack**, co-hosted by **Google DeepMind** and **Voodoo**, with **Cognition**, **YG**, and **Gradium** as event partners.

**Google** powers live dialogue and generated artwork/music; **Gradium** powers narration and spoken replies. Voodoo and YG are acknowledged as event partners. A retained Cognition/Devin adapter is not connected to Troy’s gameplay. See the [integration details](docs/SPONSORS.md).

## 📄 Documentation

- [Gameplay and technical guide](docs/GAMEPLAY.md) — building costs, combat, progression, controls, and save behavior
- [Sponsor integrations](docs/SPONSORS.md) — provider roles and current integration status
- [Asset provenance](docs/ASSETS.md) — generated media and generation scripts
- [Opening briefing manifest](public/troy/briefing-manifest.json) — narration text and generation details
- [Vercel deployment guide](docs/DEPLOYMENT.md) — hosting, private campaign storage, and release checks

## 👥 Contributors

- [Mohamed Yassine Agourram](https://github.com/MeohamedYassineAgourram)
- [CHENLongyeLucien](https://github.com/CHENLongyeLucien) — documentation contribution
