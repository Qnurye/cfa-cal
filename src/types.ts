// types.ts
// Type definitions for the application

/**
 * Cloudflare Worker environment type
 */
export interface Env {
  // KV namespace binding
  CFA_CAL_KV: KVNamespace;

  // D1 database binding
  DB: D1Database;

  // Environment variables for API access
  API_ACCOUNT: string;
  API_PASSWORD: string;
}

// Extend global scope to include our environment type
declare global {
  interface Env {
    CFA_CAL_KV: KVNamespace;
    DB: D1Database;
    API_ACCOUNT: string;
    API_PASSWORD: string;
  }
}
