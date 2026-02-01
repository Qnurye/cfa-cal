// Main Cloudflare Worker entry point
// Following Cloudflare best practices:
// - Hono router for clean, type-safe routing
// - Global error handling middleware
// - Proper response headers and caching
// - Separation of concerns

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { buildCalendarTitle, filterEventsByLocation, generateIcs, parseIcsPath } from './calendar';
import { CFA } from './config';
import type { EventFilters } from './models';
import { AuthService, CalendarService } from './services';
import type { Env } from './types';
import { isAppError } from './utils/errors';
import { CACHE, error, ics, json, paginated, success } from './utils/response';

// Create Hono app with typed environment
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Global error handler
app.onError((err, c) => {
  console.error('[Worker] Unhandled error:', err);
  const status = isAppError(err) ? err.statusCode : 500;
  const message = err.message || 'Internal server error';
  return error(c, message, status);
});

// 404 handler
app.notFound((c) => {
  return error(c, 'Not found', 404);
});

// ============================================================================
// Routes
// ============================================================================

/** Health check / info endpoint with agent instructions */
app.get('/', (c) => {
  return json(c, {
    name: 'CFA Calendar API',
    version: '2.2.0',
    description: 'China Film Archive (中国电影资料馆) screening calendar API. Provides movie screening schedules for CFA cinemas in Beijing and Suzhou.',
    llms_txt: '/llms.txt',
    agent_instructions: {
      overview: 'This API provides cinema screening data for the China Film Archive. Use /api/events for listings, /api/events/search for finding specific movies, and /*.ics endpoints for calendar subscriptions.',
      common_tasks: [
        {
          task: 'Find screenings for a specific movie',
          endpoint: 'GET /api/events/search?q={movie_name}',
          example: '/api/events/search?q=霸王别姬',
        },
        {
          task: 'Get all screenings for a specific date',
          endpoint: 'GET /api/events?date={YYYY-MM-DD}',
          example: '/api/events?date=2026-02-01',
        },
        {
          task: 'Get screenings at a specific cinema',
          endpoint: 'GET /api/events?cinema={keyword}',
          example: '/api/events?cinema=小西天',
        },
        {
          task: 'Subscribe to calendar for a location',
          endpoint: 'GET /{city}/{cinema}/{hall}/calendar.ics',
          example: '/beijing/xiaoxitian/calendar.ics',
        },
      ],
      locations: {
        beijing: ['xiaoxitian (小西天)', 'baiziwan (百子湾)'],
        suzhou: ['jiangnan (江南分馆)'],
      },
      tips: [
        'Use /api/locations to get the full location hierarchy with codes',
        'All event times are in China Standard Time (CST/UTC+8)',
        'The API caches data for 12 hours; use /api/calendar/refresh to force update',
        'For MCP integration, connect to /mcp endpoint',
      ],
    },
    endpoints: {
      calendar: '/api/calendar',
      refresh: '/api/calendar/refresh',
      events: '/api/events',
      eventsSearch: '/api/events/search',
      eventById: '/api/events/:id',
      locations: '/api/locations',
      stats: '/api/stats',
      status: '/api/status',
      ics: '/{city?}/{cinema?}/{hall?}/calendar.ics',
      mcp: '/mcp',
      llms: '/llms.txt',
    },
  });
});

/** LLMs.txt - AI-friendly documentation following llmstxt.org standard */
app.get('/llms.txt', (c) => {
  const content = `# CFA Calendar API

> China Film Archive (中国电影资料馆) screening calendar API. Query movie screenings at CFA cinemas in Beijing and Suzhou, with ICS calendar export support.

This API provides programmatic access to movie screening schedules at China Film Archive venues. Data is refreshed every 12 hours and covers three months (previous, current, next).

## Quick Start

- [GET /api/events](/api/events): List all screenings with pagination
- [GET /api/events/search?q={query}](/api/events/search): Search for movies by name
- [GET /api/events/{id}](/api/events/123): Get single event details
- [GET /api/locations](/api/locations): Get location hierarchy (cities/cinemas/halls)

## Calendar Endpoints

- [GET /calendar.ics](/calendar.ics): All screenings as ICS calendar
- [GET /{city}/calendar.ics](/beijing/calendar.ics): Filter by city
- [GET /{city}/{cinema}/calendar.ics](/beijing/xiaoxitian/calendar.ics): Filter by cinema
- [GET /{city}/{cinema}/{hall}/calendar.ics](/beijing/xiaoxitian/1/calendar.ics): Filter by hall

## Data Endpoints

- [GET /api/calendar](/api/calendar): Raw calendar data (days + events)
- [GET /api/stats](/api/stats): Aggregate statistics
- [GET /api/status](/api/status): API health and cache status

## Locations

Beijing (beijing):
- 小西天 (xiaoxitian): Halls 1, 2
- 百子湾 (baiziwan): Hall 1

Suzhou (suzhou):
- 江南分馆 (jiangnan): Halls 1, 2, 3, 4

## Query Parameters

Events endpoint supports:
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)
- city: Filter by city keyword
- cinema: Filter by cinema keyword
- hall: Filter by hall keyword
- date: Filter by exact date (YYYY-MM-DD)
- startDate: Filter from date
- endDate: Filter to date

Search endpoint supports:
- q: Search query (matches movie name or activity)
- All filters from events endpoint

## Event Object

Each event contains:
- id: Unique identifier
- show_name: Movie title (Chinese)
- screen_start_time: Screening datetime (ISO 8601)
- screen_cinema: Venue and hall info
- film_area: Country/region of origin
- film_type: Genre
- film_year: Release year
- screen_time_len: Runtime in minutes
- show_price: Ticket price
- activity: Special activities/events
- cover_img1: Poster image URL

## MCP Integration

For AI agent integration via Model Context Protocol:
- [POST /mcp](/mcp): MCP endpoint for tool calls

## Optional

- [GET /api/calendar/refresh](/api/calendar/refresh): Force data refresh
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE.LONG}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
});

/** Get three months calendar data (JSON) - previous, current, and next month */
app.get('/api/calendar', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  // Check if we need to refresh data
  const shouldUpdate = await calendarService.shouldUpdateCalendar();

  if (shouldUpdate) {
    const refreshResult = await calendarService.refreshThreeMonthsCalendar();
    if (refreshResult.success) {
      await calendarService.updateLastFetchTime();
    }
  }

  const calendarData = await calendarService.getThreeMonthsCalendar();
  return json(c, calendarData, { cache: CACHE.MEDIUM });
});

/** Force refresh calendar data for three months */
app.get('/api/calendar/refresh', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const refreshResult = await calendarService.refreshThreeMonthsCalendar();

  if (!refreshResult.success) {
    return error(c, 'Failed to refresh calendar data from upstream API');
  }

  await calendarService.updateLastFetchTime();

  return success(c, {
    refreshed: true,
    monthsRefreshed: refreshResult.monthsRefreshed,
    monthsFailed: refreshResult.monthsFailed,
  }, `Calendar data refreshed successfully (${refreshResult.monthsRefreshed} months)`);
});

/** List events with pagination and filters */
app.get('/api/events', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  // Parse query parameters
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));

  const filters: EventFilters = {
    city: c.req.query('city') || undefined,
    cinema: c.req.query('cinema') || undefined,
    hall: c.req.query('hall') || undefined,
    date: c.req.query('date') || undefined,
    startDate: c.req.query('startDate') || undefined,
    endDate: c.req.query('endDate') || undefined,
  };

  const { events, meta } = await calendarService.searchEvents(filters, undefined, page, limit);
  return paginated(c, events, meta);
});

/** Search events by query string */
app.get('/api/events/search', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const query = c.req.query('q') || '';
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));

  const filters: EventFilters = {
    city: c.req.query('city') || undefined,
    cinema: c.req.query('cinema') || undefined,
    date: c.req.query('date') || undefined,
  };

  const { events, meta } = await calendarService.searchEvents(filters, query, page, limit);
  return paginated(c, events, meta);
});

/** Get single event by ID */
app.get('/api/events/:id', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return error(c, 'Invalid event ID', 400);
  }

  const event = await calendarService.getEventById(id);
  if (!event) {
    return error(c, 'Event not found', 404);
  }

  return json(c, { data: event }, { cache: CACHE.MEDIUM });
});

/** Get location hierarchy (cities/cinemas/halls) */
app.get('/api/locations', (c) => {
  return json(c, { data: CFA }, { cache: CACHE.LONG });
});

/** Get aggregate statistics */
app.get('/api/stats', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const stats = await calendarService.getStats();
  return json(c, { data: stats }, { cache: CACHE.MEDIUM });
});

/** Get API health and cache status */
app.get('/api/status', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const status = await calendarService.getStatus();
  return json(c, { data: status }, { cache: CACHE.SHORT });
});

/** MCP endpoint - Model Context Protocol for AI agents */
app.all('/mcp', async (c) => {
  // Dynamic import to avoid bundling MCP SDK in all routes
  const { handleMcpRequest } = await import('./mcp');
  return handleMcpRequest(c.req.raw, c.env, c.executionCtx);
});

app.all('/mcp/*', async (c) => {
  // Dynamic import to avoid bundling MCP SDK in all routes
  const { handleMcpRequest } = await import('./mcp');
  return handleMcpRequest(c.req.raw, c.env, c.executionCtx);
});

/** ICS calendar export - supports filtering by city/cinema/hall */
app.get('/*', async (c) => {
  const pathname = new URL(c.req.url).pathname;

  // Only handle paths ending with calendar.ics
  if (!pathname.endsWith('/calendar.ics')) {
    return error(c, 'Not found', 404);
  }

  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  // Check if we need to refresh data (same logic as /api/calendar)
  const shouldUpdate = await calendarService.shouldUpdateCalendar();
  if (shouldUpdate) {
    const refreshResult = await calendarService.refreshThreeMonthsCalendar();
    if (refreshResult.success) {
      await calendarService.updateLastFetchTime();
    }
  }

  // Parse location codes from path
  const { cityCode, cinemaCode, hallCode } = parseIcsPath(pathname);
  const title = buildCalendarTitle(cityCode, cinemaCode, hallCode);

  // Get calendar data (three months)
  const calendarData = await calendarService.getThreeMonthsCalendar();
  const events = calendarData.events || [];

  // Filter by location
  const filteredEvents = filterEventsByLocation(events, cityCode, cinemaCode, hallCode);

  // Generate ICS
  const result = generateIcs(filteredEvents, title);

  if (!result.success) {
    return error(c, result.error);
  }

  return ics(c, result.content);
});

// ============================================================================
// Scheduled handler (Cron trigger)
// ============================================================================

async function handleScheduled(env: Env): Promise<void> {
  console.log('[Scheduled] Running calendar refresh for three months');

  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  try {
    const refreshResult = await calendarService.refreshThreeMonthsCalendar();

    if (!refreshResult.success) {
      console.error('[Scheduled] Failed to refresh any calendar data');
      return;
    }

    await calendarService.updateLastFetchTime();
    console.log(`[Scheduled] Successfully refreshed ${refreshResult.monthsRefreshed} months (${refreshResult.monthsFailed} failed)`);
  } catch (err) {
    console.error('[Scheduled] Error:', err);
  }
}

// ============================================================================
// Export Worker
// ============================================================================

export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(handleScheduled(env));
  },
};
