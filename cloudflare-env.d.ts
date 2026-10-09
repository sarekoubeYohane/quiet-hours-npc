declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS?: Fetcher;
    /** Wrangler environment name: local, test or production. */
    APP_ENV?: string;
  }
}

declare namespace Cloudflare {
  interface Env {
    AUTH_ORIGIN?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    GITHUB_ALLOWED_IDS?: string;
    SESSION_SECRET?: string;
    MODEL_KEY_ENCRYPTION_SECRET?: string;
  }
}

