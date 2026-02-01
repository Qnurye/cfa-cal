// Type definitions for the application
// Hono-compatible Cloudflare Worker environment types

import type { Context } from 'hono';

/**
 * Cloudflare Worker environment bindings
 */
export interface Env {
  // KV namespace binding
  CFA_CAL_KV: KVNamespace;
  // D1 database binding
  DB: D1Database;
  // Environment variables for API access
  API_ACCOUNT: string;
  API_PASSWORD: string;
  // TMDb API key (optional - if not set, TMDb enrichment is skipped)
  TMDB_API_KEY?: string;
}

/**
 * Hono context with our environment
 */
export type AppContext = Context<{ Bindings: Env }>;

/**
 * Variables that can be set on context
 */
export interface AppVariables {
  requestId?: string;
}

// Extend global scope for wrangler types compatibility
declare global {
  interface Env {
    CFA_CAL_KV: KVNamespace;
    DB: D1Database;
    API_ACCOUNT: string;
    API_PASSWORD: string;
    TMDB_API_KEY?: string;
  }
}
