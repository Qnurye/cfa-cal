// ICS calendar generation
// Following Cloudflare best practices:
// - Clean, functional code
// - Type safety
// - Proper error handling

import { createEvents, type EventAttributes, type DurationObject } from 'ics';
import { CFA } from './config';
import type { CalendarEvent } from './models';

/** Parsed location info from event */
interface ParsedLocation {
  cityCode: string;
  cinemaCode: string;
  hallCode: string;
  displayLocation: string;
  geo: { lat: number; lon: number };
}

/** Lookup maps for O(1) code resolution */
const cityMap = new Map(CFA.map((c) => [c.city_code, c.name]));
const cinemaMap = new Map(CFA.flatMap((c) => c.cinemas.map((ci) => [ci.cinema_code, ci.name])));
const hallMap = new Map(
  CFA.flatMap((c) => c.cinemas.flatMap((ci) => ci.halls.map((h) => [h.hall_code, h.name])))
);

/**
 * Parse location string to extract city/cinema/hall codes
 */
export function parseLocation(location: string): ParsedLocation {
  for (const city of CFA) {
    for (const cinema of city.cinemas) {
      for (const hall of cinema.halls) {
        if (hall.keywords.every((k) => location.includes(k))) {
          return {
            cityCode: city.city_code,
            cinemaCode: cinema.cinema_code,
            hallCode: hall.hall_code,
            displayLocation: `${city.name}${cinema.location}${hall.name}`,
            geo: { lat: cinema.lat, lon: cinema.lng },
          };
        }
      }
    }
  }
  return {
    cityCode: '',
    cinemaCode: '',
    hallCode: '',
    displayLocation: location,
    geo: { lat: 0, lon: 0 },
  };
}

/**
 * Build display title from path codes
 */
export function buildCalendarTitle(cityCode: string, cinemaCode: string, hallCode: string): string {
  const parts: string[] = [];

  if (cityCode) {
    parts.push(cityMap.get(cityCode) || cityCode);
  }
  if (cinemaCode) {
    parts.push(cinemaMap.get(cinemaCode) || cinemaCode);
  }
  if (hallCode) {
    parts.push(hallMap.get(hallCode) || hallCode);
  }

  return parts.length > 0 ? parts.join(' ') : 'CFA Calendar';
}

/**
 * Filter events by location codes (empty code matches all)
 */
export function filterEventsByLocation(
  events: CalendarEvent[],
  cityCode: string,
  cinemaCode: string,
  hallCode: string
): CalendarEvent[] {
  return events.filter((event) => {
    const loc = parseLocation(event.screen_cinema);
    return (
      (!cityCode || loc.cityCode === cityCode) &&
      (!cinemaCode || loc.cinemaCode === cinemaCode) &&
      (!hallCode || loc.hallCode === hallCode)
    );
  });
}

/** Default movie duration in minutes */
const DEFAULT_DURATION_MINUTES = 120;

/**
 * Convert database event to ICS event attributes
 */
function toIcsEvent(event: CalendarEvent, calendarTitle: string): EventAttributes | null {
  if (!event.screen_start_time) return null;

  const startDate = new Date(event.screen_start_time);
  if (isNaN(startDate.getTime())) return null;

  // Convert to UTC by subtracting 8 hours (China timezone)
  startDate.setHours(startDate.getHours() - 8);

  const location = parseLocation(event.screen_cinema);

  const description = [
    event.film_type,
    event.film_area ? `/ ${event.film_area}` : '',
    event.activity ? `\n${event.activity}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Determine duration (use actual value or default)
  const durationMinutes = event.screen_time_len ? Number(event.screen_time_len) : DEFAULT_DURATION_MINUTES;
  const duration: DurationObject = { minutes: durationMinutes };

  return {
    start: [
      startDate.getFullYear(),
      startDate.getMonth() + 1,
      startDate.getDate(),
      startDate.getHours(),
      startDate.getMinutes(),
    ],
    startInputType: 'utc',
    duration,
    title: event.show_name,
    description,
    location: location.displayLocation,
    geo: location.geo,
    url: `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(event.show_name)}`,
    status: 'TENTATIVE',
    uid: `${event.id}@cfa-cal`,
    productId: 'cfa-cal/ics',
    calName: calendarTitle,
    organizer: { name: 'cfa-cal', email: 'contact@qnury.es' },
  };
}

/**
 * Generate ICS content from events
 * @returns ICS string or error message
 */
export function generateIcs(
  events: CalendarEvent[],
  calendarTitle: string
): { success: true; content: string } | { success: false; error: string } {
  const icsEvents = events.map((e) => toIcsEvent(e, calendarTitle)).filter((e): e is EventAttributes => e !== null);

  const { error, value } = createEvents(icsEvents);

  if (error) {
    return { success: false, error: error.message || String(error) };
  }

  return { success: true, content: value! };
}

/**
 * Parse ICS path to extract location codes
 * Supports: /calendar.ics, /{city}/calendar.ics, /{city}/{cinema}/calendar.ics, /{city}/{cinema}/{hall}/calendar.ics
 */
export function parseIcsPath(pathname: string): {
  cityCode: string;
  cinemaCode: string;
  hallCode: string;
} {
  const parts = pathname.split('/').filter(Boolean);

  // Remove 'calendar.ics' from the end
  if (parts.length > 0 && parts[parts.length - 1] === 'calendar.ics') {
    parts.pop();
  }

  return {
    cityCode: parts[0] || '',
    cinemaCode: parts[1] || '',
    hallCode: parts[2] || '',
  };
}
