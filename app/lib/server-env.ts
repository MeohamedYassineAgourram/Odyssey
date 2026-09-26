import { env } from "node:process";

// Server-only imports. With this project's nodejs_compat runtime, Cloudflare
// secrets populate process.env; .env files supply the same values in local dev.
// https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/
export function serverEnv(name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function providerStatus() {
  return {
    gemini: Boolean(serverEnv("GEMINI_API_KEY")),
    gradium: Boolean(serverEnv("GRADIUM_API_KEY")),
    devin: Boolean(serverEnv("DEVIN_API_KEY")),
  };
}
