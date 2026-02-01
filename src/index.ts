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
      mcp: '/mcp',
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
