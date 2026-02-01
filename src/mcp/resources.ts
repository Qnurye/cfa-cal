// MCP Resource definitions for CFA Calendar
// Exposes calendar data and location hierarchy as resources

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CFA } from '../config';
import { AuthService, CalendarService } from '../services';
import type { Env } from '../types';

/**
 * Register all MCP resources on the server
 */
export function registerResources(server: McpServer, env: Env): void {
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  // Resource: Current calendar data (3 months)
  server.resource(
    'calendar://events/current',
    'Current 3-month calendar data including all screenings',
    async () => {
      const calendarData = await calendarService.getThreeMonthsCalendar();

      // Sort events by date/time
      const events = (calendarData.events || []).sort((a, b) =>
        new Date(a.screen_start_time).getTime() - new Date(b.screen_start_time).getTime()
      );

      return {
        contents: [{
          uri: 'calendar://events/current',
          mimeType: 'application/json',
          text: JSON.stringify({
            description: 'CFA Calendar - Current 3 months of screenings',
            generatedAt: new Date().toISOString(),
            totalEvents: events.length,
            totalDays: calendarData.days?.length || 0,
            events: events.map(e => ({
              id: e.id,
              title: e.show_name,
              date: e.date,
              startTime: e.screen_start_time,
              duration: e.screen_time_len,
              venue: e.screen_cinema,
              filmType: e.film_type,
              filmArea: e.film_area,
              filmYear: e.film_year,
              price: e.show_price,
              activity: e.activity || null,
              hasActivity: e.have_activity === 'true',
            })),
          }, null, 2),
        }],
      };
    }
  );

  // Resource: Complete location hierarchy
  server.resource(
    'calendar://locations',
    'Complete hierarchy of CFA cities, cinemas, and screening halls',
    async () => {
      const locations = CFA.map(city => ({
        name: city.name,
        code: city.city_code,
        cinemas: city.cinemas.map(cinema => ({
          name: cinema.name,
          code: cinema.cinema_code,
          address: cinema.location,
          coordinates: {
            latitude: cinema.lat,
            longitude: cinema.lng,
          },
          halls: cinema.halls.map(hall => ({
            name: hall.name,
            code: hall.hall_code,
            keywords: hall.keywords,
          })),
        })),
      }));

      return {
        contents: [{
          uri: 'calendar://locations',
          mimeType: 'application/json',
          text: JSON.stringify({
            description: 'CFA Locations - Cities, Cinemas, and Halls',
            totalCities: locations.length,
            totalCinemas: locations.reduce((sum, c) => sum + c.cinemas.length, 0),
            totalHalls: locations.reduce((sum, c) =>
              sum + c.cinemas.reduce((cSum, ci) => cSum + ci.halls.length, 0), 0),
            locations,
          }, null, 2),
        }],
      };
    }
  );
}
