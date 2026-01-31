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

/** Get current month calendar data (JSON) */
app.get('/api/calendar', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  // Check if we need to refresh data
  const shouldUpdate = await calendarService.shouldUpdateCalendar();

  if (shouldUpdate) {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const calendarData = await calendarService.fetchMonthCalendar(year, month);

    if (calendarData) {
      const stored = await calendarService.storeCalendarData(calendarData);
      if (stored) {
        await calendarService.updateLastFetchTime();
      }
    }
  }

  const calendarData = await calendarService.getCurrentMonthCalendar();
  return json(c, calendarData, { cache: CACHE.MEDIUM });
});

/** Force refresh calendar data */
app.get('/api/calendar/refresh', async (c) => {
  const env = c.env;
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const calendarData = await calendarService.fetchMonthCalendar(year, month);

  if (!calendarData) {
    return error(c, 'Failed to fetch calendar data from upstream API');
  }

  const stored = await calendarService.storeCalendarData(calendarData);

  if (!stored) {
    return error(c, 'Failed to store calendar data');
  }

  await calendarService.updateLastFetchTime();

  return success(c, { refreshed: true }, 'Calendar data refreshed successfully');
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

  // Parse location codes from path
  const { cityCode, cinemaCode, hallCode } = parseIcsPath(pathname);
  const title = buildCalendarTitle(cityCode, cinemaCode, hallCode);

  // Get calendar data
  const calendarData = await calendarService.getCurrentMonthCalendar();
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
  console.log('[Scheduled] Running calendar refresh');

  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  try {
    const calendarData = await calendarService.fetchMonthCalendar(year, month);

    if (!calendarData) {
      console.error('[Scheduled] Failed to fetch calendar data');
      return;
    }

    const stored = await calendarService.storeCalendarData(calendarData);

    if (!stored) {
      console.error('[Scheduled] Failed to store calendar data');
      return;
    }

    await calendarService.updateLastFetchTime();
    console.log(`[Scheduled] Successfully refreshed calendar for ${year}-${month}`);
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
