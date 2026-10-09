declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS?: Fetcher;
    /** Wrangler environment name: local, test or production. */
    APP_ENV?: string;
  }
}
