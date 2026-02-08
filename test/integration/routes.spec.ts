// Integration tests for HTTP routes

import { describe, it, expect, vi } from 'vitest';
import { SELF } from 'cloudflare:test';

// Mock ics module to avoid compatibility issues with Workers runtime
vi.mock('ics', () => ({
  createEvents: vi.fn((events) => {
    if (!events || events.length === 0) {
      return { value: 'BEGIN:VCALENDAR\nVERSION:2.0\nCALSCALE:GREGORIAN\nPRODID:adamgibbons/ics\nMETHOD:PUBLISH\nX-PUBLISHED-TTL:PT1H\nEND:VCALENDAR', error: null };
    }
    const eventStrings = events.map((e: any) => `BEGIN:VEVENT\nSUMMARY:${e.title}\nUID:${e.uid}\nEND:VEVENT`).join('\n');
    return {
      value: `BEGIN:VCALENDAR\nVERSION:2.0\nCALSCALE:GREGORIAN\nPRODID:adamgibbons/ics\nMETHOD:PUBLISH\nX-PUBLISHED-TTL:PT1H\n${eventStrings}\nEND:VCALENDAR`,
      error: null,
    };
  }),
}));

describe('HTTP Routes Integration', () => {
  describe('GET /', () => {
    it('should return API info with correct structure', async () => {
      const response = await SELF.fetch('https://example.com/');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.name).toBe('CFA Calendar API');
      expect(body.version).toBe('2.2.0');
    });

    it('should include endpoints in response', async () => {
      const response = await SELF.fetch('https://example.com/');
      const body = await response.json();

      expect(body.endpoints).toBeDefined();
      expect(body.endpoints.calendar).toBe('/api/calendar');
      expect(body.endpoints.refresh).toBe('/api/calendar/refresh');
      expect(body.endpoints.ics).toBeDefined();
    });

    it('should include CORS headers', async () => {
      const response = await SELF.fetch('https://example.com/');

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should have JSON content-type', async () => {
      const response = await SELF.fetch('https://example.com/');

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('GET /api/calendar', () => {
    it('should return calendar data structure', async () => {
      const response = await SELF.fetch('https://example.com/api/calendar');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('days');
      expect(body).toHaveProperty('events');
    });

    it('should return arrays for days and events', async () => {
      const response = await SELF.fetch('https://example.com/api/calendar');
      const body = await response.json();

      expect(Array.isArray(body.days)).toBe(true);
      expect(Array.isArray(body.events)).toBe(true);
    });

    it('should set cache headers', async () => {
      const response = await SELF.fetch('https://example.com/api/calendar');

      expect(response.headers.get('Cache-Control')).toContain('max-age');
    });
  });

  describe('GET /calendar.ics', () => {
    it('should return ICS content type', async () => {
      const response = await SELF.fetch('https://example.com/calendar.ics');

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });

    it('should set content-disposition header', async () => {
      const response = await SELF.fetch('https://example.com/calendar.ics');

      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('calendar.ics');
    });

    it('should return valid ICS structure', async () => {
      const response = await SELF.fetch('https://example.com/calendar.ics');
      const body = await response.text();

      expect(body).toContain('BEGIN:VCALENDAR');
      expect(body).toContain('END:VCALENDAR');
    });

    it('should include cache headers', async () => {
      const response = await SELF.fetch('https://example.com/calendar.ics');

      expect(response.headers.get('Cache-Control')).toContain('max-age');
    });
  });

  describe('GET /{city}/calendar.ics', () => {
    it('should return ICS for city filter', async () => {
      const response = await SELF.fetch('https://example.com/beijing/calendar.ics');

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });

    it('should return ICS for Suzhou', async () => {
      const response = await SELF.fetch('https://example.com/suzhou/calendar.ics');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /{city}/{cinema}/calendar.ics', () => {
    it('should return ICS for city+cinema filter', async () => {
      const response = await SELF.fetch('https://example.com/beijing/xiaoxitian/calendar.ics');

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });
  });

  describe('GET /{city}/{cinema}/{hall}/calendar.ics', () => {
    it('should return ICS for full location filter', async () => {
      const response = await SELF.fetch('https://example.com/beijing/xiaoxitian/1/calendar.ics');

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });
  });

  // =====================================================================
  // New API endpoints: /api/events, /api/events/search, /api/events/:id,
  //                    /api/locations, /api/stats
  // =====================================================================

  describe('GET /api/events', () => {
    it('should return paginated event list', async () => {
      const response = await SELF.fetch('https://example.com/api/events');
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
      expect(Array.isArray(body.events)).toBe(true);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('should respect page and limit params', async () => {
      const response = await SELF.fetch('https://example.com/api/events?page=2&limit=5');
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(5);
      expect(body.events.length).toBeLessThanOrEqual(5);
    });

    it('should clamp limit to max 100', async () => {
      const response = await SELF.fetch('https://example.com/api/events?limit=999');
      const body = await response.json() as any;

      expect(body.limit).toBe(100);
    });

    it('should filter by city code', async () => {
      const response = await SELF.fetch('https://example.com/api/events?city=beijing');
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      // All returned events should be in Beijing cinemas
      for (const event of body.events) {
        expect(event.screen_cinema).toMatch(/小西天|百子湾/);
      }
    });

    it('should filter by cinema name', async () => {
      const response = await SELF.fetch(
        'https://example.com/api/events?cinema=' + encodeURIComponent('小西天')
      );
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      for (const event of body.events) {
        expect(event.screen_cinema).toContain('小西天');
      }
    });

    it('should filter by cinema code', async () => {
      const response = await SELF.fetch('https://example.com/api/events?cinema=baiziwan');
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      for (const event of body.events) {
        expect(event.screen_cinema).toContain('百子湾');
      }
    });

    it('should filter by date range', async () => {
      const response = await SELF.fetch(
        'https://example.com/api/events?startDate=2026-01-01&endDate=2026-01-31'
      );
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      for (const event of body.events) {
        expect(event.screen_start_time >= '2026-01-01').toBe(true);
        expect(event.screen_start_time <= '2026-01-31 23:59:59').toBe(true);
      }
    });

    it('should filter by exact date', async () => {
      const response = await SELF.fetch('https://example.com/api/events?date=2026-02-08');
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      for (const event of body.events) {
        expect(event.screen_start_time).toContain('2026-02-08');
      }
    });

    it('should combine city and date filters', async () => {
      const response = await SELF.fetch(
        'https://example.com/api/events?city=beijing&date=2026-02-08'
      );
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      for (const event of body.events) {
        expect(event.screen_cinema).toMatch(/小西天|百子湾/);
        expect(event.screen_start_time).toContain('2026-02-08');
      }
    });

    it('should set cache headers', async () => {
      const response = await SELF.fetch('https://example.com/api/events');
      expect(response.headers.get('Cache-Control')).toContain('max-age');
    });
  });

  describe('GET /api/events/search', () => {
    it('should require q parameter', async () => {
      const response = await SELF.fetch('https://example.com/api/events/search');
      expect(response.status).toBe(400);

      const body = await response.json() as any;
      expect(body.error).toContain('q');
    });

    it('should return matching events', async () => {
      // First get any event name to search for
      const allResp = await SELF.fetch('https://example.com/api/events?limit=1');
      const allBody = await allResp.json() as any;

      if (allBody.events.length === 0) return; // no data to test

      const name = allBody.events[0].show_name;
      const response = await SELF.fetch(
        'https://example.com/api/events/search?q=' + encodeURIComponent(name)
      );
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('total');
      expect(body.total).toBeGreaterThanOrEqual(1);
      for (const event of body.events) {
        expect(event.show_name.toLowerCase()).toContain(name.toLowerCase());
      }
    });

    it('should return empty for nonsense query', async () => {
      const response = await SELF.fetch(
        'https://example.com/api/events/search?q=zzzznonexistent999'
      );
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body.total).toBe(0);
      expect(body.events).toEqual([]);
    });

    it('should be case-insensitive', async () => {
      const allResp = await SELF.fetch('https://example.com/api/events?limit=1');
      const allBody = await allResp.json() as any;
      if (allBody.events.length === 0) return;

      const name = allBody.events[0].show_name;
      const upper = await SELF.fetch(
        'https://example.com/api/events/search?q=' + encodeURIComponent(name.toUpperCase())
      );
      const lower = await SELF.fetch(
        'https://example.com/api/events/search?q=' + encodeURIComponent(name.toLowerCase())
      );
      const upperBody = await upper.json() as any;
      const lowerBody = await lower.json() as any;

      expect(upperBody.total).toBe(lowerBody.total);
    });
  });

  describe('GET /api/events/:id', () => {
    it('should return a single event by ID', async () => {
      // Get an event ID first
      const allResp = await SELF.fetch('https://example.com/api/events?limit=1');
      const allBody = await allResp.json() as any;
      if (allBody.events.length === 0) return;

      const id = allBody.events[0].id;
      const response = await SELF.fetch(`https://example.com/api/events/${id}`);
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body.id).toBe(id);
      expect(body).toHaveProperty('show_name');
      expect(body).toHaveProperty('screen_cinema');
    });

    it('should return 404 for nonexistent ID', async () => {
      const response = await SELF.fetch('https://example.com/api/events/99999999');
      expect(response.status).toBe(404);

      const body = await response.json() as any;
      expect(body.error).toContain('not found');
    });
  });

  describe('GET /api/locations', () => {
    it('should return location hierarchy', async () => {
      const response = await SELF.fetch('https://example.com/api/locations');
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2); // beijing + suzhou
    });

    it('should include city codes and cinemas', async () => {
      const response = await SELF.fetch('https://example.com/api/locations');
      const body = await response.json() as any;

      const beijing = body.find((c: any) => c.city_code === 'beijing');
      expect(beijing).toBeDefined();
      expect(beijing.cinemas.length).toBeGreaterThanOrEqual(1);
      expect(beijing.cinemas[0]).toHaveProperty('cinema_code');
      expect(beijing.cinemas[0]).toHaveProperty('halls');
    });

    it('should set cache headers', async () => {
      const response = await SELF.fetch('https://example.com/api/locations');
      expect(response.headers.get('Cache-Control')).toContain('max-age');
    });
  });

  describe('GET /api/stats', () => {
    it('should return aggregate statistics', async () => {
      const response = await SELF.fetch('https://example.com/api/stats');
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('totalEvents');
      expect(body).toHaveProperty('byCity');
      expect(body).toHaveProperty('byCinema');
      expect(typeof body.totalEvents).toBe('number');
    });

    it('should include known cities in byCity', async () => {
      const response = await SELF.fetch('https://example.com/api/stats');
      const body = await response.json() as any;

      // If there are events, at least one city should appear
      if (body.totalEvents > 0) {
        const cityKeys = Object.keys(body.byCity);
        expect(cityKeys.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should set cache headers', async () => {
      const response = await SELF.fetch('https://example.com/api/stats');
      expect(response.headers.get('Cache-Control')).toContain('max-age');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await SELF.fetch('https://example.com/unknown/route');

      expect(response.status).toBe(404);
    });

    it('should return JSON error for unknown routes', async () => {
      const response = await SELF.fetch('https://example.com/unknown/route');
      const body = await response.json();

      expect(body.error).toBe('Not found');
      expect(body.success).toBe(false);
    });

    it('should return 404 for paths that do not end with calendar.ics', async () => {
      const response = await SELF.fetch('https://example.com/beijing/xiaoxitian/something');

      expect(response.status).toBe(404);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers on all responses', async () => {
      const endpoints = [
        '/',
        '/api/calendar',
        '/calendar.ics',
        '/beijing/calendar.ics',
      ];

      for (const endpoint of endpoints) {
        const response = await SELF.fetch(`https://example.com${endpoint}`);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      }
    });
  });
});
