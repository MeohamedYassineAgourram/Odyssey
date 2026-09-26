# TROY 120 assets

The procedural city, buildings, horse finales, combat, ocean, lighting, and effects live in `app/troy/`, with reusable character models under `app/oracle/`. Bundled resources below were generated through real Google and Gradium calls on September 26, 2026. Loading and playback make no generation requests.

## New Troy assets

| File | Provider / model | Purpose |
| --- | --- | --- |
| [public/troy/cover.jpg](../public/troy/cover.jpg) | Google / `gemini-3.1-flash-image` | Coastal Troy city-building key art |
| [public/troy/intro.wav](../public/troy/intro.wav) | Gradium / `default` | New 12.24-second city-building introduction |

The [Troy manifest](../public/troy/manifest.json) records provider, model, exact prompt or narration, timestamp, and original output bytes. The new narration introduces houses, contracts, the bell, and raiders.

## Reused generated assets

These files remain under [public/oracle/](../public/oracle/) and are used by Troy.

| Files | Provider / model | Current purpose |
| --- | --- | --- |
| `lyra.jpg`, `mira.jpg`, `theron.jpg` | Google / `gemini-3.1-flash-image` | Founder, healer, and architect portraits |
| `marble.jpg`, `sky.jpg` | Google / `gemini-3.1-flash-image` | Architectural texture and sky artwork |
| `music-explore.mp3` | Google / `lyria-3-clip-preview` | Building/battle score, 30.772 seconds |
| `music-sanctuary.mp3` | Google / `lyria-3-clip-preview` | Finale score, 27.324 seconds |

Music prompts requested instrumental lyre, harp, wooden flute, strings, and restrained percussion. The sanctuary filename is retained; Troy has no sanctuary phase. Earlier ORACLE cover/narration remain compatibility assets, replaced by the Troy files in the interface.

The [ORACLE manifest](../public/oracle/manifest.json) preserves reused generation records. JPEG delivery files may be resized/compressed with macOS `sips`; manifest byte counts describe original provider output and may differ from delivered sizes. Credentials are never recorded. Live dialogue uses `/api/voice`; browser speech fallback is labeled separately.

## Generate missing assets

Scripts read server credentials from the environment or ignored `.env`. They preserve existing files. Generation is separate from builds and gameplay; missing assets require provider calls and spend credits.

```bash
node scripts/generate-troy-assets.mjs
```

This considers both Troy `cover.jpg` and `intro.wav`; it has no per-file selector. The cover requires `GEMINI_API_KEY`; narration requires `GRADIUM_API_KEY` and uses `GRADIUM_VOICE_ID` when configured. To regenerate intentionally, move the existing file aside first. Provenance is written to the Troy manifest.

For reused assets:

```bash
node scripts/generate-oracle-assets.mjs images
node scripts/generate-oracle-assets.mjs music
node scripts/generate-oracle-assets.mjs lyra.jpg
```

Its `all`/`voice` modes also generate old ORACLE cover/narration if missing; use the Troy script for current title art and introduction. `public/generated/` and ECHO SHIFT resources belong to the previous game.

Provider references: [Gemini images](https://ai.google.dev/gemini-api/docs/image-generation), [Lyria music](https://ai.google.dev/gemini-api/docs/music-generation), [Gradium speech](https://docs.gradium.ai/guides/text-to-speech-rest).
