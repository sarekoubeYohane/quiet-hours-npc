declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    USAGE_DB?: D1Database;
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


declare namespace Cloudflare {
  interface Env {
    /** Explicit opt-in only; absent/false leaves all recall transports disabled. */
    RECALL_ENABLED?: string;
    /** Shared billing D1 across local/test/production; distinct from each world DB. */
    RECALL_USAGE_DB?: D1Database;
    MEMORY_VECTOR_INDEX?: Vectorize;
    /** Site owner's separate OpenAI key; never a user's chat key. */
    OWNER_EMBEDDING_KEY?: string;
    /** JSON object keyed embedding/index/search/chat; monthly conservative units. */
    RECALL_BUDGET_LIMITS?: string;
  }
}
