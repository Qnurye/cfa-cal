import { Env } from './types';
import { AuthService, CalendarService } from './services';
import { createEvents } from 'ics';
import { CFA } from './config';

const parseLocation = (location: string): {
  city_code: string,
  cinema_code: string,
  hall_code: string,
  location: string,
  geo: { lat: number, lon: number }
} => {
  for (const city of CFA) {
    for (const cinema of city.cinemas) {
      for (const hall of cinema.halls) {
        if (hall.keywords.every((k) => location.includes(k))) {
          return {
            city_code: city.city_code,
            cinema_code: cinema.cinema_code,
            hall_code: hall.hall_code,
            location: city.name + cinema.location + hall.name,
            geo: { lat: cinema.lat, lon: cinema.lng }
          };
        }
      }
    }
  }
  return { city_code: '', cinema_code: '', hall_code: '', location, geo: { lat: 0, lon: 0 } };
};

const codeToCity = (code: string): string => {
  for (const city of CFA) {
    if (city.city_code === code) {
      return city.name;
    }
  }
  return '';
};

const codeToCinema = (code: string): string => {
  for (const city of CFA) {
    for (const cinema of city.cinemas) {
      if (cinema.cinema_code === code) {
        return cinema.name;
      }
    }
  }
  return '';
};

const codeToHall = (code: string): string => {
  for (const city of CFA) {
    for (const cinema of city.cinemas) {
      for (const hall of cinema.halls) {
        if (hall.hall_code === code) {
          return hall.name;
        }
      }
    }
  }
  return '';
};

/**
 * Handle requests to the /{city}/{area}/{theatre}/calendar.ics endpoint
 */
export async function handleCalendarICSRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  let city_code = '', cinema_code = '', hall_code = '', title = 'CFA Calendar';
  const paramsCount = url.pathname.split('/').length;
  if (paramsCount === 3) {
    [, city_code] = url.pathname.split('/');
    title = codeToCity(city_code);
  }
  else if (paramsCount === 4) {
    [, city_code, cinema_code] = url.pathname.split('/');
    title = codeToCity(city_code) + ' ' + codeToCinema(cinema_code);
  }
  else if (paramsCount === 5) {
    [, city_code, cinema_code, hall_code] = url.pathname.split('/');
    title = codeToCity(city_code) + ' ' + codeToCinema(cinema_code) + ' ' + codeToHall(hall_code);
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
        cinema_code: event_area_code,
        hall_code: event_theatre_code
      } = parseLocation(event.screen_cinema);
      return (city_code === event_city_code || city_code === '') && (cinema_code === event_area_code || cinema_code === '') && (hall_code === event_theatre_code || hall_code === '');
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
        calName: title,
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
