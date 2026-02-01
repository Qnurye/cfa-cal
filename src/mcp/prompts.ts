// MCP Prompt definitions for CFA Calendar
// Provides helper prompts for common use cases

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register all MCP prompts on the server
 */
export function registerPrompts(server: McpServer): void {
  // Prompt: find_screenings - Help find movie screenings
  server.prompt(
    'find_screenings',
    'Help find movie screenings at CFA cinemas. Use this to get guidance on searching for specific movies or browsing available screenings.',
    {
      movie_name: z.string().optional().describe('Optional movie name to search for'),
      city: z.string().optional().describe('Optional city preference (beijing or suzhou)'),
      date: z.string().optional().describe('Optional date preference (YYYY-MM-DD)'),
    },
    async ({ movie_name, city, date }) => {
      let instruction = `You are helping a user find movie screenings at China Film Archive (CFA) cinemas.

Available locations:
- Beijing: Xiaoxitian (小西天) with halls 1-2, Baiziwan (百子湾) with hall 1
- Suzhou: Jiangnan branch (江南分馆) with halls 1-4

`;

      if (movie_name) {
        instruction += `The user is looking for screenings of "${movie_name}". Use the search_events tool to find matching screenings.\n`;
      }

      if (city) {
        instruction += `The user prefers screenings in ${city === 'beijing' ? 'Beijing' : city === 'suzhou' ? 'Suzhou' : city}.\n`;
      }

      if (date) {
        instruction += `The user is interested in screenings on ${date}. Use the get_events_by_date tool.\n`;
      }

      if (!movie_name && !date) {
        instruction += `Start by using the list_events tool to show upcoming screenings. You can filter by location if the user has a preference.\n`;
      }

      instruction += `
When presenting results:
1. Show the movie title, date, time, and venue clearly
2. Mention if there are any special activities (Q&A, introductions, etc.)
3. Provide the event ID so the user can get more details if needed
4. If they want to subscribe to updates, help them generate an ICS calendar URL

Use the available tools: list_events, search_events, get_events_by_date, get_event_details, get_locations, get_calendar_ics_url`;

      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: instruction,
          },
        }],
      };
    }
  );

  // Prompt: subscribe_calendar - Help subscribe to calendar updates
  server.prompt(
    'subscribe_calendar',
    'Help users subscribe to CFA screening calendar updates using ICS feeds.',
    {
      city: z.string().optional().describe('Optional city to filter (beijing or suzhou)'),
      cinema: z.string().optional().describe('Optional cinema to filter'),
    },
    async ({ city, cinema }) => {
      let instruction = `You are helping a user subscribe to CFA (China Film Archive) screening calendar updates.

The CFA Calendar service provides ICS calendar feeds that can be subscribed to in any calendar app (Google Calendar, Apple Calendar, Outlook, etc.).

Available filter options:
- All screenings: /calendar.ics
- By city: /{city}/calendar.ics (e.g., /beijing/calendar.ics)
- By cinema: /{city}/{cinema}/calendar.ics (e.g., /beijing/xiaoxitian/calendar.ics)
- By hall: /{city}/{cinema}/{hall}/calendar.ics (e.g., /beijing/xiaoxitian/1/calendar.ics)

`;

      if (city) {
        instruction += `The user wants to subscribe to screenings in ${city}. `;
      }
      if (cinema) {
        instruction += `They're specifically interested in ${cinema} cinema. `;
      }

      instruction += `
Steps to help:
1. Use get_locations to show available cities, cinemas, and halls if the user needs to choose
2. Use get_calendar_ics_url to generate the appropriate subscription URL
3. Explain how to add the calendar subscription to their specific calendar app

Common calendar apps:
- Google Calendar: Settings > Add calendar > From URL
- Apple Calendar: File > New Calendar Subscription
- Outlook: Add calendar > Subscribe from web
- iOS: Settings > Calendar > Accounts > Add Account > Other > Add Subscribed Calendar

The calendar updates automatically every 12 hours with new screening information.`;

      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: instruction,
          },
        }],
      };
    }
  );
}
