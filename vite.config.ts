import { execSync } from "node:child_process";
import vinext from "vinext";
import { defineConfig } from "vite";
import { devMockAuth } from "./tooling/dev-mock-auth";

// Commit short code shown in the UI and by /api/environment; null when git is unavailable
// and lib/environment.ts then reports unknown.
function gitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

export default defineConfig(async ({ command }) => {
  // Use Miniflare's local Request.cf placeholder and keep Wrangler quiet. These are
  // non-secret tool settings; Worker vars and secrets live in wrangler.jsonc and .dev.vars.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Wrangler snapshots some settings while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: { __GIT_COMMIT__: JSON.stringify(gitCommit()) },
    plugins: [
      vinext(),
      // Transitional local sign-in until GitHub login (#23) replaces the Sites identity headers.
      ...(command === "serve" ? [devMockAuth()] : []),
      // Bindings, vars and environments come from wrangler.jsonc.
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
      }),
    ],
  };
});
