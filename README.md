
> [!warning]
>
> 本项目是一个技术学习项目，用于演示 API 集成、数据处理和日历同步等技术。所有数据均为模拟数据，与任何现实实体、组织或服务无关。使用者需自行承担使用风险，开发者不承担任何法律责任。

| URL                                                      | 说明            |
| -------------------------------------------------------- | ------------- |
| <https://cfa.qnury.es/calendar.ics>                      | 本月所有放映片单      |
| <https://cfa.qnury.es/beijing/calendar.ics>              | 北京本月片单        |
| <https://cfa.qnury.es/suzhou/calendar.ics>               | 苏州本月片单        |
| <https://cfa.qnury.es/beijing/xiaoxitian/calendar.ics>   | 小西天本月片单       |
| <https://cfa.qnury.es/beijing/baiziwan/calendar.ics>     | 百子湾本月片单       |
| <https://cfa.qnury.es/suzhou/jiangnan/calendar.ics>      | 江南分馆本月片单      |
| <https://cfa.qnury.es/beijing/xiaoxitian/1/calendar.ics> | 小西天 1 号厅本月片单  |
| <https://cfa.qnury.es/beijing/xiaoxitian/2/calendar.ics> | 小西天 2 号厅本月片单  |
| <https://cfa.qnury.es/beijing/baiziwan/1/calendar.ics>   | 百子湾 1 号厅本月片单  |
| <https://cfa.qnury.es/suzhou/jiangnan/1/calendar.ics>    | 江南分馆 1 号厅本月片单 |
| <https://cfa.qnury.es/suzhou/jiangnan/2/calendar.ics>    | 江南分馆 2 号厅本月片单 |
| <https://cfa.qnury.es/suzhou/jiangnan/3/calendar.ics>    | 江南分馆 3 号厅本月片单 |
| <https://cfa.qnury.es/suzhou/jiangnan/4/calendar.ics>    | 江南分馆 4 号厅本月片单 |

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

- [Node.js](https://nodejs.org/) (>= 20.x)
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

### GET /api/{city?}/{cinema?}/{hall?}/calendar.ics

Retrieve specified calendar.

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
