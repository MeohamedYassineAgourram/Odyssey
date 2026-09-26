// Only expose the app's bindings. Loading all Worker globals would replace
// browser DOM types used by the React/Three.js client.
declare module "cloudflare:workers" {
  export const env: {
    DB?: import("@cloudflare/workers-types").D1Database;
  };
}
