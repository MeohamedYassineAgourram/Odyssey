import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  // Sites still builds through Vite. Native Next.js runs on Vercel, where the
  // progress route uses private Vercel Blob storage instead of a Worker binding.
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      resolve(process.cwd(), "db/vercel-cloudflare.ts"),
    ));
    return config;
  },
};

export default nextConfig;
