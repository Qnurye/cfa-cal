// index.ts
// Main Cloudflare Worker entry point

import { AuthService, CalendarService } from './services';
import { Env } from './types';

/**
 * Main worker handler
 */
export default {
  /**
   * Handle incoming HTTP requests
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // API endpoints
    if (path === '/api/calendar') {
      return await handleCalendarRequest(request, env, ctx);
    } else if (path === '/api/calendar/refresh') {
      return await handleCalendarRefreshRequest(request, env, ctx);
    }

    // Default response
    return new Response('CFA Calendar API', {
      headers: { 'content-type': 'application/json' }
    });
  },

  /**
   * Handle scheduled events
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Running scheduled event: ${event.cron}`);

    // Create service instances
    const authService = new AuthService(env);
    const calendarService = new CalendarService(env, authService);

    // Get current date to determine which month to fetch
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    try {
      // Fetch the latest calendar data
      const calendarData = await calendarService.fetchMonthCalendar(year, month);

      if (calendarData) {
        // Store the calendar data in the database
        const success = await calendarService.storeCalendarData(calendarData);

        if (success) {
          // Update the last fetch time
          await calendarService.updateLastFetchTime();
          console.log(`Successfully updated calendar data for ${year}-${month}`);
        } else {
          console.error(`Failed to store calendar data for ${year}-${month}`);
        }
      } else {
        console.error(`Failed to fetch calendar data for ${year}-${month}`);
      }
    } catch (error) {
      console.error('Error in scheduled task:', error);
    }
  }
};

/**
 * Handle requests to the /api/calendar endpoint
 */
async function handleCalendarRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Create service instances
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  try {
    // Check if we need to update the calendar data
    const shouldUpdate = await calendarService.shouldUpdateCalendar();

    if (shouldUpdate) {
      // Get current date
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');

      // Fetch the latest calendar data
      const calendarData = await calendarService.fetchMonthCalendar(year, month);

      if (calendarData) {
        // Store the calendar data
        const success = await calendarService.storeCalendarData(calendarData);

        if (success) {
          // Update the last fetch time
          await calendarService.updateLastFetchTime();
        } else {
          console.error('Failed to store calendar data');
        }
      }
    }

    // Get calendar data from database
    const calendarData = await calendarService.getCurrentMonthCalendar();

    // Return the calendar data
    return new Response(JSON.stringify(calendarData), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Error handling calendar request:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve calendar data' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}

/**
 * Handle requests to manually refresh the calendar data
 */
async function handleCalendarRefreshRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Create service instances
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  try {
    // Get current date
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    // Fetch the latest calendar data
    const calendarData = await calendarService.fetchMonthCalendar(year, month);

    if (calendarData) {
      // Store the calendar data
      const success = await calendarService.storeCalendarData(calendarData);

      if (success) {
        // Update the last fetch time
        await calendarService.updateLastFetchTime();

        return new Response(
          JSON.stringify({ success: true, message: 'Calendar data refreshed successfully' }),
          { headers: { 'content-type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, message: 'Failed to refresh calendar data' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error handling calendar refresh request:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to refresh calendar data' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
