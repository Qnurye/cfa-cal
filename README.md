# CFA Calendar API

A Cloudflare Worker application for fetching and storing cinema calendar data from the China Film Archive API.

## Features

- Authenticates with the remote API and caches access tokens
- Fetches calendar data for movie screenings
- Stores calendar data in Cloudflare D1 database
- Provides API endpoints to access the calendar data
- Includes scheduled tasks to keep data up-to-date

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (>= 16.x)
- [pnpm](https://pnpm.io/) (recommended) or npm
- [Cloudflare Workers account](https://dash.cloudflare.com/sign-up/workers)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/get-started/) installed

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   pnpm install
   ```

### Configuration

1. Create D1 database and KV namespace:
   ```
   pnpm db:create
   pnpm kv:create
   ```

2. Update your `wrangler.jsonc` with the generated IDs for D1 database and KV namespace.

3. Set API credentials:
   ```
   wrangler secret put API_ACCOUNT
   wrangler secret put API_PASSWORD
   ```

4. Deploy the schema to D1:
   ```
   pnpm db:execute
   ```

5. Generate TypeScript types:
   ```
   pnpm cf-typegen
   ```

### Development

Start a local development server:

```
pnpm dev
```

### Deployment

Deploy to Cloudflare Workers:

```
pnpm deploy
```

## API Endpoints

### GET /api/calendar

Returns the current month's calendar data from the database. If data is stale or doesn't exist, it will fetch fresh data from the remote API before responding.

### GET /api/calendar/refresh

Force a refresh of the calendar data from the remote API.

## Scheduled Tasks

The worker automatically refreshes calendar data every 12 hours using Cloudflare's cron triggers.

## Data Structure

### D1 Database

The application uses a D1 database with the following tables:

- `calendar_events`: Stores detailed information about each movie screening
- `calendar_days`: Stores summary information for each day
- `fetch_logs`: Logs each data fetch attempt

### KV Storage

The KV namespace is used to store:

- API access tokens and expiration timestamps
- Last fetch timestamp for determining when to refresh data

## License

MIT