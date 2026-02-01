// MCP Tool definitions for CFA Calendar
// Provides tools for querying events, searching movies, and getting location info

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CFA } from '../config';
import { filterEventsByLocation, parseLocation } from '../calendar';
import { AuthService, CalendarService } from '../services';
import type { Env } from '../types';
import type { CalendarEvent } from '../models';

/**
 * Register all MCP tools on the server
 */
export function registerTools(server: McpServer, env: Env): void {
  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  // Tool: list_events - List upcoming screenings with optional filters
  server.tool(
    'list_events',
    'List upcoming movie screenings at CFA cinemas. Optionally filter by city, cinema, hall, or date.',
    {
      city: z.string().optional().describe('City code (e.g., "beijing", "suzhou")'),
      cinema: z.string().optional().describe('Cinema code (e.g., "xiaoxitian", "baiziwan", "jiangnan")'),
      hall: z.string().optional().describe('Hall code (e.g., "1", "2")'),
      date: z.string().optional().describe('Date filter in YYYY-MM-DD format'),
      limit: z.number().optional().default(20).describe('Maximum number of events to return (default: 20)'),
    },
    async ({ city, cinema, hall, date, limit }) => {
      const calendarData = await calendarService.getThreeMonthsCalendar();
      let events = calendarData.events || [];

      // Apply location filter
      if (city || cinema || hall) {
        events = filterEventsByLocation(events, city || '', cinema || '', hall || '');
      }

      // Apply date filter
      if (date) {
        events = events.filter(e => e.date === date);
      }

      // Sort by screening time and limit results
      events = events
        .sort((a, b) => new Date(a.screen_start_time).getTime() - new Date(b.screen_start_time).getTime())
        .slice(0, limit);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            count: events.length,
            events: events.map(formatEventSummary),
          }, null, 2),
        }],
      };
    }
  );

  // Tool: search_events - Search events by movie name or keywords
  server.tool(
    'search_events',
    'Search for movie screenings by movie name or keywords.',
    {
      query: z.string().describe('Search query (movie name or keywords)'),
      city: z.string().optional().describe('City code to filter results'),
      limit: z.number().optional().default(10).describe('Maximum number of events to return (default: 10)'),
    },
    async ({ query, city, limit }) => {
      const calendarData = await calendarService.getThreeMonthsCalendar();
      let events = calendarData.events || [];

      // Filter by city if provided
      if (city) {
        events = filterEventsByLocation(events, city, '', '');
      }

      // Search by query (case-insensitive)
      const queryLower = query.toLowerCase();
      events = events.filter(e =>
        e.show_name.toLowerCase().includes(queryLower) ||
        e.activity?.toLowerCase().includes(queryLower) ||
        e.film_type?.toLowerCase().includes(queryLower) ||
        e.film_area?.toLowerCase().includes(queryLower)
      );

      // Sort by screening time and limit results
      events = events
        .sort((a, b) => new Date(a.screen_start_time).getTime() - new Date(b.screen_start_time).getTime())
        .slice(0, limit);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            query,
            count: events.length,
            events: events.map(formatEventSummary),
          }, null, 2),
        }],
      };
    }
  );

  // Tool: get_locations - Get cities/cinemas/halls hierarchy
  server.tool(
    'get_locations',
    'Get the complete hierarchy of CFA locations: cities, cinemas, and screening halls.',
    {
      city: z.string().optional().describe('Optional city code to get only that city\'s details'),
    },
    async ({ city }) => {
      let locations = CFA;

      if (city) {
        locations = locations.filter(c => c.city_code === city);
      }

      const formatted = locations.map(c => ({
        name: c.name,
        code: c.city_code,
        cinemas: c.cinemas.map(ci => ({
          name: ci.name,
          code: ci.cinema_code,
          location: ci.location,
          coordinates: { lat: ci.lat, lng: ci.lng },
          halls: ci.halls.map(h => ({
            name: h.name,
            code: h.hall_code,
          })),
        })),
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(formatted, null, 2),
        }],
      };
    }
  );

  // Tool: get_event_details - Get full event details by ID
  server.tool(
    'get_event_details',
    'Get complete details for a specific screening event by its ID.',
    {
      event_id: z.number().describe('The event ID to look up'),
    },
    async ({ event_id }) => {
      const calendarData = await calendarService.getThreeMonthsCalendar();
      const event = calendarData.events?.find(e => e.id === event_id);

      if (!event) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: 'Event not found', event_id }, null, 2),
          }],
          isError: true,
        };
      }

      const location = parseLocation(event.screen_cinema);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: event.id,
            title: event.show_name,
            date: event.date,
            startTime: event.screen_start_time,
            duration: event.screen_time_len,
            price: event.show_price,
            venue: {
              raw: event.screen_cinema,
              city: location.cityCode,
              cinema: location.cinemaCode,
              hall: location.hallCode,
              display: location.displayLocation,
              coordinates: location.geo,
            },
            film: {
              type: event.film_type,
              area: event.film_area,
              year: event.film_year,
            },
            activity: event.activity || null,
            hasActivity: event.have_activity === 'true',
            coverImage: event.cover_img1 || null,
            salesTime: event.screen_sales_time,
            doubanSearchUrl: `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(event.show_name)}`,
          }, null, 2),
        }],
      };
    }
  );

  // Tool: get_events_by_date - Get all events on a specific date
  server.tool(
    'get_events_by_date',
    'Get all screening events on a specific date.',
    {
      date: z.string().describe('Date in YYYY-MM-DD format'),
      city: z.string().optional().describe('Optional city code to filter'),
      cinema: z.string().optional().describe('Optional cinema code to filter'),
    },
    async ({ date, city, cinema }) => {
      const calendarData = await calendarService.getThreeMonthsCalendar();
      let events = calendarData.events?.filter(e => e.date === date) || [];

      // Apply location filter
      if (city || cinema) {
        events = filterEventsByLocation(events, city || '', cinema || '', '');
      }

      // Sort by screening time
      events = events.sort((a, b) =>
        new Date(a.screen_start_time).getTime() - new Date(b.screen_start_time).getTime()
      );

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            date,
            count: events.length,
            events: events.map(formatEventSummary),
          }, null, 2),
        }],
      };
    }
  );

  // Tool: get_calendar_ics_url - Generate ICS subscription URL
  server.tool(
    'get_calendar_ics_url',
    'Generate an ICS calendar subscription URL for CFA screenings. Use this to subscribe in calendar apps like Google Calendar, Apple Calendar, or Outlook.',
    {
      city: z.string().optional().describe('City code to filter (e.g., "beijing", "suzhou")'),
      cinema: z.string().optional().describe('Cinema code to filter (e.g., "xiaoxitian", "jiangnan")'),
      hall: z.string().optional().describe('Hall code to filter (e.g., "1", "2")'),
      base_url: z.string().optional().default('https://cfa-cal.qnury.es').describe('Base URL of the calendar service'),
    },
    async ({ city, cinema, hall, base_url }) => {
      // Build path segments
      const segments: string[] = [];
      if (city) segments.push(city);
      if (cinema) segments.push(cinema);
      if (hall) segments.push(hall);

      const path = segments.length > 0 ? `/${segments.join('/')}/calendar.ics` : '/calendar.ics';
      const url = `${base_url}${path}`;

      // Build description of what this URL includes
      const filterDesc: string[] = [];
      if (city) {
        const cityInfo = CFA.find(c => c.city_code === city);
        filterDesc.push(`City: ${cityInfo?.name || city}`);
      }
      if (cinema) {
        const cinemaInfo = CFA.flatMap(c => c.cinemas).find(ci => ci.cinema_code === cinema);
        filterDesc.push(`Cinema: ${cinemaInfo?.name || cinema}`);
      }
      if (hall) {
        filterDesc.push(`Hall: ${hall}`);
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            url,
            description: filterDesc.length > 0
              ? `ICS calendar filtered by: ${filterDesc.join(', ')}`
              : 'ICS calendar for all CFA screenings',
            usage: 'Copy this URL and add it as a calendar subscription in your calendar app.',
            examples: {
              googleCalendar: 'Settings > Add calendar > From URL',
              appleCalendar: 'File > New Calendar Subscription',
              outlook: 'Add calendar > Subscribe from web',
            },
          }, null, 2),
        }],
      };
    }
  );
}

/**
 * Format an event for summary display
 */
function formatEventSummary(event: CalendarEvent) {
  const location = parseLocation(event.screen_cinema);
  return {
    id: event.id,
    title: event.show_name,
    date: event.date,
    startTime: event.screen_start_time,
    duration: event.screen_time_len,
    venue: location.displayLocation,
    city: location.cityCode,
    cinema: location.cinemaCode,
    hall: location.hallCode,
    filmType: event.film_type,
    filmArea: event.film_area,
    hasActivity: event.have_activity === 'true',
    activity: event.activity || null,
  };
}
