import { Env } from './types';
import { AuthService, CalendarService } from './services';
import { createEvents } from 'ics';
import { CINEMAS } from './config';

const parseLocation = (location: string): {
  city_code: string,
  area_code: string,
  theatre_code: string,
  location: string,
  geo: { lat: number, lon: number }
} => {
  for (const cinema of CINEMAS) {
    for (const area of cinema.areas) {
      for (const theatre of area.theatres) {
        if (theatre.keywords.every((k) => location.includes(k))) {
          return {
            city_code: cinema.city_code,
            area_code: area.area_code,
            theatre_code: theatre.theatre_code,
            location: cinema.city + area.location + theatre.name,
            geo: { lat: area.lat, lon: area.lng }
          };
        }
      }
    }
  }
  return { city_code: '', area_code: '', theatre_code: '', location, geo: { lat: 0, lon: 0 } };
};

/**
 * Handle requests to the /{city}/{area}/{theatre}/calendar.ics endpoint
 */
export async function handleCalendarICSRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  let city_code = '', area_code = '', theatre_code = '';
  const paramsCount = url.pathname.split('/').length;
  if (paramsCount === 3) {
    [, city_code] = url.pathname.split('/');
  }
  else if (paramsCount === 4) {
    [, city_code, area_code] = url.pathname.split('/');
  }
  else if (paramsCount === 5) {
    [, city_code, area_code, theatre_code] = url.pathname.split('/');
  }

  const authService = new AuthService(env);
  const calendarService = new CalendarService(env, authService);

  try {
    const calendarData = await calendarService.getCurrentMonthCalendar();
    const events = calendarData.events || [];

    const icsEvents = events
    .filter((event) => {
      const {
        city_code: event_city_code,
        area_code: event_area_code,
        theatre_code: event_theatre_code
      } = parseLocation(event.screen_cinema);
      return (city_code === event_city_code || city_code === '') && (area_code === event_area_code || area_code === '') && (theatre_code === event_theatre_code || theatre_code === '');
    })
    .map((event) => {
      let startArr: number[] | null = null;
      if (event.screen_start_time) {
        const d = new Date(event.screen_start_time);
        d.setHours(d.getHours() - 8);
        if (!isNaN(d.getTime())) {
          startArr = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
        }
      }
      let duration = undefined;
      if (event.screen_time_len && !isNaN(event.screen_time_len)) {
        duration = { minutes: Number(event.screen_time_len) };
      }
      if (!startArr) return null;
      return {
        start: startArr,
        startInputType: 'utc',
        duration,
        title: event.show_name,
        description: event.film_type + (event.film_area ? ' / ' + event.film_area : '') + (event.activity ? ('\n' + event.activity) : ''),
        location: parseLocation(event.screen_cinema).location,
        geo: parseLocation(event.screen_cinema).geo,
        url: 'https://search.douban.com/movie/subject_search?search_text=' + encodeURIComponent(event.show_name),
        categories: [],
        status: 'TENTATIVE',
        uid: String(event.id) + '@cfa-cal',
        productId: 'cfa-cal/ics',
        calName: 'cfa-cal',
        organizer: { name: 'cfa-cal', email: 'contact@qnury.es' }
      };
    })
    .filter((e) => e && Array.isArray(e.start)) as any[];

    const { error, value } = createEvents(icsEvents);
    if (error) {
      return new Response(JSON.stringify({ error: error.message || error }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(value, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="calendar.ics"'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || error }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
