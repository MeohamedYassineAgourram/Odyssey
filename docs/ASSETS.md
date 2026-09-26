# THE LAST ORACLE assets

The 3D island, buildings, characters, ocean, lighting and effects are implemented in `app/oracle/`. The bundled resources below were produced through real Google and Gradium calls on September 26, 2026. Playback and loading do not make new generation requests.

All current generated files are in [`public/oracle/`](../public/oracle/).

| Files | Provider / model | Purpose |
| --- | --- | --- |
| `cover.jpg` | Google / `gemini-3.1-flash-image` | Original game key art |
| `lyra.jpg`, `mira.jpg`, `theron.jpg` | Google / `gemini-3.1-flash-image` | Original character portraits |
| `marble.jpg`, `sky.jpg` | Google / `gemini-3.1-flash-image` | Architectural texture and sky artwork |
| `music-explore.mp3` | Google / `lyria-3-clip-preview` | Original exploration score, 30.772 seconds |
| `music-sanctuary.mp3` | Google / `lyria-3-clip-preview` | Original sanctuary score, 27.324 seconds |
| `intro.wav` | Gradium / `default` | Spoken opening, 12.24 seconds |

The music prompts request instrumental lyre, harp, wooden flute, strings and restrained percussion, with no lyrics or modern synthesis. Exploration music plays during scavenging; sanctuary music accompanies camp. The introduction uses the configured Gradium voice. Live conversations use `/api/voice`; browser speech is labeled separately if that provider is unavailable.

[`manifest.json`](../public/oracle/manifest.json) records each asset's provider, model, exact prompt or spoken text, generation timestamp and original byte count. JPEGs were subsequently resized and compressed with macOS `sips` for delivery; this optimization did not regenerate them. Manifest byte counts describe the original provider output and may differ from the optimized files. Credentials are not recorded.

## Generate missing assets

The script reads server credentials from the environment or ignored `.env`. It preserves files that already exist and calls a provider only for missing assets selected by the command. Generation is not part of a build or normal gameplay.

```bash
node scripts/generate-oracle-assets.mjs all
node scripts/generate-oracle-assets.mjs images
node scripts/generate-oracle-assets.mjs music
node scripts/generate-oracle-assets.mjs voice
node scripts/generate-oracle-assets.mjs lyra.jpg
```

Image and music generation require `GEMINI_API_KEY`; speech generation requires `GRADIUM_API_KEY`. The script fixes the models listed above and uses `GRADIUM_VOICE_ID` when configured. Generating a missing asset spends provider credits. To intentionally replace an asset, move the existing file aside before selecting its filename. Output provenance is written to the manifest.

Files under `public/generated/`, the former ECHO SHIFT mission library and its older generation scripts belong to the previous game. They are retained compatibility resources and do not document the current ORACLE experience.

Provider references: [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [Lyria music generation](https://ai.google.dev/gemini-api/docs/music-generation), and [Gradium speech REST guide](https://docs.gradium.ai/guides/text-to-speech-rest).
