// Unit tests for API route handlers in src/index.ts
// Tests the route logic (filtering, pagination, search, stats) with mocked services

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sampleEvents } from '../setup/fixtures';

// Mock ics module
vi.mock('ics', () => ({
  createEvents: vi.fn(() => ({
    value: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR',
    error: null,
  })),
}));

// Mock services so route handlers don't hit real D1/KV
const mockGetThreeMonthsCalendar = vi.fn();
const mockShouldUpdateCalendar = vi.fn().mockResolvedValue(false);
const mockRefreshThreeMonthsCalendar = vi.fn();
const mockUpdateLastFetchTime = vi.fn();

vi.mock('../../src/services', () => ({
  AuthService: vi.fn(),
  CalendarService: vi.fn().mockImplementation(() => ({
    getThreeMonthsCalendar: mockGetThreeMonthsCalendar,
    shouldUpdateCalendar: mockShouldUpdateCalendar,
    refreshThreeMonthsCalendar: mockRefreshThreeMonthsCalendar,
    updateLastFetchTime: mockUpdateLastFetchTime,
  })),
}));

// Import worker after mocking
import worker from '../../src/index';

const mockEnv = {
  CFA_CAL_KV: {} as KVNamespace,
  DB: {} as D1Database,
  API_ACCOUNT: 'test',
  API_PASSWORD: 'test',
};

function request(path: string) {
  return worker.fetch(new Request(`https://test.com${path}`), mockEnv, { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext);
}

async function jsonBody(resp: Response) {
  return resp.json() as Promise<any>;
}

describe('Route Handlers Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldUpdateCalendar.mockResolvedValue(false);
    mockGetThreeMonthsCalendar.mockResolvedValue({
      days: [],
      events: [...sampleEvents],
    });
  });

  // =========================================================================
  // GET /api/events
  // =========================================================================
  describe('GET /api/events', () => {
    it('returns all events with default pagination', async () => {
      const resp = await request('/api/events');
      const body = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(body.events).toHaveLength(4);
      expect(body.total).toBe(4);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('paginates correctly', async () => {
      const resp = await request('/api/events?page=1&limit=2');
      const body = await jsonBody(resp);

      expect(body.events).toHaveLength(2);
      expect(body.total).toBe(4);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(2);
      expect(body.events[0].id).toBe(sampleEvents[0].id);
      expect(body.events[1].id).toBe(sampleEvents[1].id);
    });

    it('returns second page', async () => {
      const resp = await request('/api/events?page=2&limit=2');
      const body = await jsonBody(resp);

      expect(body.events).toHaveLength(2);
      expect(body.events[0].id).toBe(sampleEvents[2].id);
      expect(body.events[1].id).toBe(sampleEvents[3].id);
    });

    it('returns empty page beyond range', async () => {
      const resp = await request('/api/events?page=100&limit=20');
      const body = await jsonBody(resp);

      expect(body.events).toHaveLength(0);
      expect(body.total).toBe(4);
    });

    it('clamps limit to 100', async () => {
      const resp = await request('/api/events?limit=500');
      const body = await jsonBody(resp);
      expect(body.limit).toBe(100);
    });

    it('clamps limit minimum to 1', async () => {
      const resp = await request('/api/events?limit=0');
      const body = await jsonBody(resp);
      expect(body.limit).toBe(1);
    });

    it('clamps page minimum to 1', async () => {
      const resp = await request('/api/events?page=-5');
      const body = await jsonBody(resp);
      expect(body.page).toBe(1);
    });

    it('filters by city=beijing', async () => {
      const resp = await request('/api/events?city=beijing');
      const body = await jsonBody(resp);

      // sampleEvents: 3 in Beijing (小西天x2 + 百子湾), 1 in Suzhou (江南分馆)
      expect(body.total).toBe(3);
      for (const e of body.events) {
        expect(e.screen_cinema).toMatch(/小西天|百子湾/);
      }
    });

    it('filters by city=suzhou', async () => {
      const resp = await request('/api/events?city=suzhou');
      const body = await jsonBody(resp);

      expect(body.total).toBe(1);
      expect(body.events[0].screen_cinema).toContain('江南分馆');
    });

    it('filters by cinema code', async () => {
      const resp = await request('/api/events?cinema=xiaoxitian');
      const body = await jsonBody(resp);

      expect(body.total).toBe(2);
      for (const e of body.events) {
        expect(e.screen_cinema).toContain('小西天');
      }
    });

    it('filters by cinema name fallback (Chinese name)', async () => {
      // When cinema code doesn't match via filterEventsByLocation, falls back to name matching
      const resp = await request('/api/events?cinema=' + encodeURIComponent('百子湾'));
      const body = await jsonBody(resp);

      expect(body.total).toBeGreaterThanOrEqual(1);
      for (const e of body.events) {
        expect(e.screen_cinema).toContain('百子湾');
      }
    });

    it('filters by hall code', async () => {
      const resp = await request('/api/events?city=beijing&cinema=xiaoxitian&hall=1');
      const body = await jsonBody(resp);

      expect(body.total).toBe(1);
      expect(body.events[0].screen_cinema).toContain('1号厅');
    });

    it('filters by exact date', async () => {
      const resp = await request('/api/events?date=2026-01-15');
      const body = await jsonBody(resp);

      expect(body.total).toBe(1);
      expect(body.events[0].id).toBe(12345);
    });

    it('filters by startDate', async () => {
      const resp = await request('/api/events?startDate=2026-01-17');
      const body = await jsonBody(resp);

      expect(body.total).toBe(2);
      for (const e of body.events) {
        expect(e.screen_start_time >= '2026-01-17').toBe(true);
      }
    });

    it('filters by endDate', async () => {
      const resp = await request('/api/events?endDate=2026-01-16');
      const body = await jsonBody(resp);

      expect(body.total).toBe(2);
      for (const e of body.events) {
        expect(e.screen_start_time <= '2026-01-16 23:59:59').toBe(true);
      }
    });

    it('filters by date range (startDate + endDate)', async () => {
      const resp = await request('/api/events?startDate=2026-01-16&endDate=2026-01-17');
      const body = await jsonBody(resp);

      expect(body.total).toBe(2);
      expect(body.events[0].id).toBe(12346);
      expect(body.events[1].id).toBe(12347);
    });

    it('combines city and date filters', async () => {
      const resp = await request('/api/events?city=beijing&date=2026-01-15');
      const body = await jsonBody(resp);

      expect(body.total).toBe(1);
      expect(body.events[0].id).toBe(12345);
    });

    it('exact date takes precedence over startDate/endDate', async () => {
      const resp = await request('/api/events?date=2026-01-15&startDate=2026-01-01&endDate=2026-01-31');
      const body = await jsonBody(resp);

      // date filter should apply, not range
      expect(body.total).toBe(1);
      expect(body.events[0].screen_start_time).toContain('2026-01-15');
    });

    it('triggers refresh when shouldUpdateCalendar is true', async () => {
      mockShouldUpdateCalendar.mockResolvedValue(true);
      mockRefreshThreeMonthsCalendar.mockResolvedValue({ success: true, monthsRefreshed: 3, monthsFailed: 0 });

      await request('/api/events');

      expect(mockRefreshThreeMonthsCalendar).toHaveBeenCalled();
      expect(mockUpdateLastFetchTime).toHaveBeenCalled();
    });

    it('does not refresh when data is fresh', async () => {
      mockShouldUpdateCalendar.mockResolvedValue(false);

      await request('/api/events');

      expect(mockRefreshThreeMonthsCalendar).not.toHaveBeenCalled();
    });

    it('returns empty when no events match filters', async () => {
      const resp = await request('/api/events?city=nonexistent');
      const body = await jsonBody(resp);

      expect(body.total).toBe(0);
      expect(body.events).toEqual([]);
    });
  });

  // =========================================================================
  // GET /api/events/search
  // =========================================================================
  describe('GET /api/events/search', () => {
    it('returns 400 without q parameter', async () => {
      const resp = await request('/api/events/search');
      expect(resp.status).toBe(400);

      const body = await jsonBody(resp);
      expect(body.error).toContain('q');
    });

    it('returns 400 with empty q parameter', async () => {
      const resp = await request('/api/events/search?q=');
      expect(resp.status).toBe(400);
    });

    it('finds events by movie name', async () => {
      const resp = await request('/api/events/search?q=' + encodeURIComponent('霸王别姬'));
      const body = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(body.total).toBe(1);
      expect(body.events[0].show_name).toBe('霸王别姬');
    });

    it('search is case-insensitive (for latin chars)', async () => {
      // Add an event with English name for this test
      mockGetThreeMonthsCalendar.mockResolvedValue({
        days: [],
        events: [
          ...sampleEvents,
          { ...sampleEvents[0], id: 99999, show_name: 'Farewell My Concubine' },
        ],
      });

      const resp = await request('/api/events/search?q=farewell');
      const body = await jsonBody(resp);

      expect(body.total).toBe(1);
      expect(body.events[0].show_name).toBe('Farewell My Concubine');
    });

    it('returns partial matches', async () => {
      const resp = await request('/api/events/search?q=' + encodeURIComponent('大话'));
      const body = await jsonBody(resp);

      expect(body.total).toBe(1);
      expect(body.events[0].show_name).toBe('大话西游');
    });

    it('returns empty for no matches', async () => {
      const resp = await request('/api/events/search?q=zzzznonexistent');
      const body = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(body.total).toBe(0);
      expect(body.events).toEqual([]);
    });

    it('returns multiple matches', async () => {
      mockGetThreeMonthsCalendar.mockResolvedValue({
        days: [],
        events: [
          { ...sampleEvents[0], id: 1, show_name: '西游记' },
          { ...sampleEvents[0], id: 2, show_name: '大话西游' },
          { ...sampleEvents[0], id: 3, show_name: '完全不相关' },
        ],
      });

      const resp = await request('/api/events/search?q=' + encodeURIComponent('西游'));
      const body = await jsonBody(resp);

      expect(body.total).toBe(2);
    });
  });

  // =========================================================================
  // GET /api/events/:id
  // =========================================================================
  describe('GET /api/events/:id', () => {
    it('returns event by ID', async () => {
      const resp = await request('/api/events/12345');
      const body = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(body.id).toBe(12345);
      expect(body.show_name).toBe('霸王别姬');
    });

    it('returns 404 for nonexistent ID', async () => {
      const resp = await request('/api/events/99999999');
      expect(resp.status).toBe(404);

      const body = await jsonBody(resp);
      expect(body.error).toContain('not found');
    });

    it('returns 404 for non-numeric ID (parsed as NaN)', async () => {
      const resp = await request('/api/events/abc');
      expect(resp.status).toBe(404);
    });

    it('returns correct event among multiple', async () => {
      const resp = await request('/api/events/12347');
      const body = await jsonBody(resp);

      expect(body.id).toBe(12347);
      expect(body.show_name).toBe('大话西游');
    });
  });

  // =========================================================================
  // GET /api/locations
  // =========================================================================
  describe('GET /api/locations', () => {
    it('returns CFA location config', async () => {
      const resp = await request('/api/locations');
      const body = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2);
    });

    it('includes Beijing with cinemas and halls', async () => {
      const resp = await request('/api/locations');
      const body = await jsonBody(resp);

      const beijing = body.find((c: any) => c.city_code === 'beijing');
      expect(beijing).toBeDefined();
      expect(beijing.name).toBe('北京市');
      expect(beijing.cinemas.length).toBeGreaterThanOrEqual(2);

      const xiaoxitian = beijing.cinemas.find((c: any) => c.cinema_code === 'xiaoxitian');
      expect(xiaoxitian).toBeDefined();
      expect(xiaoxitian.halls.length).toBeGreaterThanOrEqual(2);
    });

    it('includes Suzhou', async () => {
      const resp = await request('/api/locations');
      const body = await jsonBody(resp);

      const suzhou = body.find((c: any) => c.city_code === 'suzhou');
      expect(suzhou).toBeDefined();
    });

    it('sets long cache header', async () => {
      const resp = await request('/api/locations');
      expect(resp.headers.get('Cache-Control')).toContain('max-age=3600');
    });
  });

  // =========================================================================
  // GET /api/stats
  // =========================================================================
  describe('GET /api/stats', () => {
    it('returns aggregate statistics', async () => {
      const resp = await request('/api/stats');
      const body = await jsonBody(resp);

      expect(resp.status).toBe(200);
      expect(body.totalEvents).toBe(4);
      expect(body).toHaveProperty('byCity');
      expect(body).toHaveProperty('byCinema');
    });

    it('counts events by city correctly', async () => {
      const resp = await request('/api/stats');
      const body = await jsonBody(resp);

      // 3 Beijing events, 1 Suzhou event
      expect(body.byCity.beijing).toBe(3);
      expect(body.byCity.suzhou).toBe(1);
    });

    it('counts events by cinema correctly', async () => {
      const resp = await request('/api/stats');
      const body = await jsonBody(resp);

      expect(body.byCinema['小西天艺术影院 1号厅']).toBe(1);
      expect(body.byCinema['小西天艺术影院 2号厅']).toBe(1);
      expect(body.byCinema['百子湾艺术影院 1 号厅']).toBe(1);
      expect(body.byCinema['江南分馆 1号厅']).toBe(1);
    });

    it('handles empty events', async () => {
      mockGetThreeMonthsCalendar.mockResolvedValue({ days: [], events: [] });

      const resp = await request('/api/stats');
      const body = await jsonBody(resp);

      expect(body.totalEvents).toBe(0);
      expect(body.byCity).toEqual({});
      expect(body.byCinema).toEqual({});
    });

    it('sets cache header', async () => {
      const resp = await request('/api/stats');
      expect(resp.headers.get('Cache-Control')).toContain('max-age');
    });
  });
});
