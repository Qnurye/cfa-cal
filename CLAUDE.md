# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start local dev server (includes --test-scheduled for cron testing)
pnpm test             # Run vitest test suite
pnpm deploy           # Deploy to Cloudflare Workers
pnpm cf-typegen       # Generate Cloudflare Worker types (run after changing bindings)
pnpm setup            # Initialize database schema + generate types
pnpm db:execute:local # Apply schema.sql to local D1
```

## Architecture

This is a Cloudflare Worker that fetches cinema screening data from an external API, stores it in D1, and serves ICS calendar exports.

### Request Flow
1. **HTTP Request** → `src/index.ts` (Hono router)
2. **Authentication** → `AuthService` (caches tokens in KV with expiry)
3. **Data Fetch** → `src/api-client.ts` (10s timeout, validates responses)
4. **Storage** → `CalendarService` batches writes to D1
5. **Response** → `src/utils/response.ts` helpers (JSON or ICS with CORS/caching)

### Key Modules
- `src/services.ts` - AuthService (token management) and CalendarService (data lifecycle, 12h cache)
- `src/calendar.ts` - ICS generation and location filtering (city/cinema/hall hierarchy)
- `src/config.ts` - Static cinema configuration (cities, cinemas, halls with matching keywords)
- `src/utils/errors.ts` - Custom error classes with HTTP status codes

### Location Filtering
Events are matched by keywords defined in `config.ts`. The URL path `/{city}/{cinema}/{hall}/calendar.ics` filters events hierarchically. Empty path segments match all at that level.

### Environment Bindings
- `CFA_CAL_KV`: KV namespace (tokens, timestamps)
- `DB`: D1 database (events, days, logs)
- `API_ACCOUNT`, `API_PASSWORD`: Secrets for external API auth

## Testing

Tests use `@cloudflare/vitest-pool-workers` with miniflare bindings. The `ics` library is mocked in unit tests to avoid Workers compatibility issues.

```bash
pnpm test                    # Run all tests
pnpm vitest test/unit/       # Run only unit tests
```
