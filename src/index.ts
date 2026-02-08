// Main Cloudflare Worker entry point
// Following Cloudflare best practices:
// - Hono router for clean, type-safe routing
// - Global error handling middleware
// - Proper response headers and caching
// - Separation of concerns

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { buildCalendarTitle, filterEventsByLocation, generateIcs, parseIcsPath, parseLocation } from './calendar';
import { CFA } from './config';
import { AuthService, CalendarService } from './services';
import type { Env } from './types';
import { isAppError } from './utils/errors';
import { CACHE, error, ics, json, success } from './utils/response';

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

/** Health check / info endpoint */
app.get('/', (c) => {
  return json(c, {
    name: 'CFA Calendar API',
    version: '2.0.0',
    endpoints: {
      calendar: '/api/calendar',
      refresh: '/api/calendar/refresh',
      ics: '/{city?}/{cinema?}/{hall?}/calendar.ics',
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

/** List events with filtering */
app.get('/api/events', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const shouldUpdate = await calendarService.shouldUpdateCalendar();
  if (shouldUpdate) {
    const refreshResult = await calendarService.refreshThreeMonthsCalendar();
    if (refreshResult.success) await calendarService.updateLastFetchTime();
  }

  const calendarData = await calendarService.getThreeMonthsCalendar();
  let events = calendarData.events || [];

  // Filter by city/cinema/hall
  const city = c.req.query('city') || '';
  const cinema = c.req.query('cinema') || '';
  const hall = c.req.query('hall') || '';

  if (city || cinema || hall) {
    events = filterEventsByLocation(events, city, cinema, hall);

    // Also support cinema name matching (e.g. cinema=小西天)
    if (cinema && events.length === 0) {
      events = (calendarData.events || []).filter((e) =>
        e.screen_cinema.includes(cinema)
      );
      // Still apply city filter if provided
      if (city) {
        events = filterEventsByLocation(events, city, '', '');
      }
    }
  }

  // Filter by date
  const date = c.req.query('date');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (date) {
    events = events.filter((e) => e.screen_start_time?.startsWith(date));
  } else {
    if (startDate) {
      events = events.filter((e) => e.screen_start_time >= startDate);
    }
    if (endDate) {
      events = events.filter((e) => e.screen_start_time <= endDate + ' 23:59:59');
    }
  }

  // Pagination
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')));
  const total = events.length;
  const paged = events.slice((page - 1) * limit, page * limit);

  return json(c, { events: paged, total, page, limit }, { cache: CACHE.MEDIUM });
});

/** Search events by movie name */
app.get('/api/events/search', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const shouldUpdate = await calendarService.shouldUpdateCalendar();
  if (shouldUpdate) {
    const refreshResult = await calendarService.refreshThreeMonthsCalendar();
    if (refreshResult.success) await calendarService.updateLastFetchTime();
  }

  const q = (c.req.query('q') || '').toLowerCase();
  if (!q) return error(c, 'Missing search query parameter "q"', 400);

  const calendarData = await calendarService.getThreeMonthsCalendar();
  const events = (calendarData.events || []).filter((e) =>
    e.show_name?.toLowerCase().includes(q)
  );

  return json(c, { events, total: events.length }, { cache: CACHE.MEDIUM });
});

/** Get single event by ID */
app.get('/api/events/:id', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const calendarData = await calendarService.getThreeMonthsCalendar();
  const id = parseInt(c.req.param('id'));
  const event = (calendarData.events || []).find((e) => e.id === id);

  if (!event) return error(c, 'Event not found', 404);
  return json(c, event, { cache: CACHE.MEDIUM });
});

/** Location hierarchy */
app.get('/api/locations', (c) => {
  return json(c, CFA, { cache: CACHE.LONG });
});

/** Aggregate stats */
app.get('/api/stats', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const calendarData = await calendarService.getThreeMonthsCalendar();
  const events = calendarData.events || [];

  const cities = new Map<string, number>();
  const cinemas = new Map<string, number>();
  for (const e of events) {
    const loc = parseLocation(e.screen_cinema);
    cities.set(loc.cityCode || 'unknown', (cities.get(loc.cityCode || 'unknown') || 0) + 1);
    cinemas.set(e.screen_cinema, (cinemas.get(e.screen_cinema) || 0) + 1);
  }

  return json(c, {
    totalEvents: events.length,
    byCity: Object.fromEntries(cities),
    byCinema: Object.fromEntries(cinemas),
  }, { cache: CACHE.MEDIUM });
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
