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
