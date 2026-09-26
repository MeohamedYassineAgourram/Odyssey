# Deploying TROY 120 to Vercel

Public game: [troy-120.vercel.app](https://troy-120.vercel.app).

Troy supports two builds from the same source:

- `npm run build` produces the existing Sites / Cloudflare Worker version, with D1 campaign storage.
- `npm run build:vercel` produces a native Next.js build for Vercel, with private Vercel Blob campaign storage.

`vercel.json` selects the Next.js build automatically. Vercel hosts the game, assets, dialogue, voice, and campaign API. It has independent campaign storage and does not depend on access to the earlier private Sites deployment.

## Deployment settings

Use the **Next.js** framework preset and Node.js **22 or newer**. Create a **private** Blob store and connect it to the Vercel project. Configure these server-side environment variables before deploying:

| Variable | Purpose |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Private campaign storage; supplied when the Blob store is connected |
| `GEMINI_API_KEY` | Live companion conversations |
| `GRADIUM_API_KEY` | Live spoken replies |
| `GEMINI_MODEL` | Optional conversation model override |
| `GRADIUM_VOICE_ID` | Optional voice override |
| `GRADIUM_MODEL` | Optional speech model override |

Never prefix these keys with `NEXT_PUBLIC_` or commit their values. `.vercelignore` excludes local environment files from uploads. The existing `DEVIN_API_KEY` is not needed by Troy.

Deploy from the linked project with:

```bash
npx vercel --prod
```

Make the production domain accessible without Vercel Authentication so judges can open it directly. Preview deployments can retain their normal protection.

## Campaign storage

On Vercel, each anonymous player has a private campaign document. Saves use conditional writes to keep concurrent requests from overwriting each other, and receipts prevent duplicate rewards when a completed run is retried. The API validates completed runs and recomputes rewards. Storage credentials stay on the server; campaign documents are not public downloads.

The player cookie belongs to the domain being played. Existing progress on the Sites domain does not automatically transfer to Vercel; visitors on Vercel begin a separate anonymous campaign. Completed attempts and explicit exits save progress. Closing a tab mid-run does not save that unfinished run.

The Sites build continues using its original D1 database. Vercel functions never pretend to save progress in memory or temporary files.

## Verify a release

Check the production page and bundled artwork/audio without signing in. Check `/api/status` for configured providers and `/api/troy/progress` for a new profile and game cookie. Save a completed test run, repeat the same run ID, and verify its rewards were applied only once. Test another cookie to confirm profiles remain separate.

For local checks of the Vercel build, provide the private Blob token and set `TROY_STORAGE=vercel-blob` in an ignored environment file, then run:

```bash
npm run build:vercel
npm run start:vercel
```

Leave `TROY_STORAGE` unset when using `npm run dev` for the normal Sites/D1 development environment. The Cloudflare binding replacement in `next.config.ts` applies only to the native Next.js build.
