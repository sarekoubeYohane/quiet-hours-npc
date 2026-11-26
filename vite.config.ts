import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vinext from "vinext";
import { defineConfig } from "vite";

// Commit short code and build time shown in the UI and by /api/environment; the commit is null
// when git is unavailable and lib/environment.ts then reports unknown.
function gitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder and keep Wrangler quiet. These are
  // non-secret tool settings; Worker vars and secrets live in wrangler.jsonc and .dev.vars.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Wrangler snapshots some settings while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      __GIT_COMMIT__: JSON.stringify(gitCommit()),
      __BUILT_AT__: JSON.stringify(new Date().toISOString()),
      __TEST_NPC_PROMPT__: JSON.stringify(process.env.CLOUDFLARE_ENV === "test"
        ? readFileSync(new URL("./docs/design/npc-prompt-rewrite-draft.md", import.meta.url), "utf8")
        : ""),
      // 只有測試站建置對 DeepSeek 開啟 thinking（reasoning_effort low）；其他環境維持關閉。
      __DEEPSEEK_THINKING__: JSON.stringify(process.env.CLOUDFLARE_ENV === "test" ? "low" : ""),
      // 只有測試站建置開啟「格式驗證失敗時重試一次」；其他環境維持單次派送即失敗。
      __FORMAT_REPAIR__: JSON.stringify(process.env.CLOUDFLARE_ENV === "test" ? "1" : ""),
    },
    // Only server environments emit maps; keep them out of public client assets.
    environments: {
      // Vite defaults to dropping entry signatures. With vinext's shared browser
      // entry, that also drops the namespace Link loads dynamically for prefetch
      // and navigation. Keep it intact in production builds (dev is unaffected).
      client: { build: { rolldownOptions: { preserveEntrySignatures: "strict" as const } } },
      rsc: { build: { sourcemap: true } },
      ssr: { build: { sourcemap: true } },
    },
    plugins: [
      vinext(),
      // Bindings, vars and environments come from wrangler.jsonc.
      cloudflare({
        configPath: "wrangler.jsonc",
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
      }),
    ],
  };
});
