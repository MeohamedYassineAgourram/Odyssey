# Generated assets

The playable world uses procedural Three.js geometry, ocean shaders, lighting, and particles. The resources below were generated through real provider calls and are bundled for local playback. Loading them does not make a new AI request.

| Resource | Generator | Use |
| --- | --- | --- |
| `app/game/generated-missions.json` | Google Gemini `gemini-3.8-flash` | Still Tide, Gale Front, and Crystal Bloom: three briefings paired with supported starting modifiers. |
| `public/generated/drift-sky.jpg` | Google Gemini `gemini-3.1-flash-image` | A 21:9 sky panorama, requested at 2K, loaded asynchronously onto the sky sphere. The procedural sky remains the fallback. |
| `public/generated/voices/still-tide.wav` | Gradium `default` | Spoken Still Tide title and briefing. |
| `public/generated/voices/gale-front.wav` | Gradium `default` | Spoken Gale Front title and briefing. |
| `public/generated/voices/crystal-bloom.wav` | Gradium `default` | Spoken Crystal Bloom title and briefing. |
| `public/og.png` | Built-in ImageGen | Social link preview artwork. |

The Gemini assets were generated on September 26, 2026. [`public/generated/manifest.json`](../public/generated/manifest.json) records their exact prompts, models, generation times, and provider usage. [`public/generated/voices/manifest.json`](../public/generated/voices/manifest.json) records the Gradium model, voice identifier, spoken text, generation time, and output sizes. Neither manifest contains a credential.

Mission selection applies its starting modifier for 15 seconds after resetting the run. All missions retain the 12-shard objective and 90-second survival requirement. Saved briefs display **GEMINI MISSION**; new director responses display **GEMINI LIVE** only after a successful live request. Sound is off initially. With sound enabled, a selected mission plays its saved Gradium briefing; unavailable audio uses the existing labeled voice fallback.

## Regenerate deliberately

These commands read server-only provider settings and spend provider credits. They are not build steps:

```bash
node scripts/generate-resources.mjs missions
node scripts/generate-resources.mjs sky
node scripts/generate-voice.mjs
```

Generate voice again whenever mission text changes. The Gemini script validates the mission structure and JPEG output before replacing assets. The Gradium script validates the WAV response. Keep credentials in the ignored local environment or server runtime secrets, never in an asset or browser bundle.

## Social preview

`public/og.png` is the finished promotional card, generated with the built-in ImageGen tool.

Generation prompt:

> Use case: ads-marketing. Create one finished landscape social link-preview card, approx 1200x630 aspect ratio, for an actual browser 3D game called ECHO SHIFT. Premium editorial game art. Large tight bold cream typography 'ECHO' above acid-lime typography 'SHIFT' on left, small exact tagline 'The world listens.' below. Right side depicts a small faceted futuristic hovercraft with cyan luminous engines skimming a dark teal endless ocean toward one monumental glowing pale-lime circular portal. Floating angular basalt islands, peach sunset horizon in distant atmospheric fog, small cyan crystal shards, restrained cinematic game graphics. Dark ink navy #09131a and teal palette, acid-lime #dbff73 typography, warm ivory #f2f0df. Strong negative space around title, beautifully legible at small sizes. All text exactly as specified only. No logos, sponsors, other text, UI buttons, watermark or extra lettering. Deliver as a complete coherent card, not a webpage mockup.
