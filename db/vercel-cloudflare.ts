import type { D1Database } from "@cloudflare/workers-types";

// Native Next.js has no Worker bindings. This replacement is used only by its
// webpack build; Vite/Sites keeps the real cloudflare:workers import. Vercel's
// progress API uses private Vercel Blob storage before any code tries to access
// D1. Missing configuration fails explicitly rather than
// pretending to save player progress in an ephemeral function filesystem.
export const env: { DB?: D1Database } = {};
