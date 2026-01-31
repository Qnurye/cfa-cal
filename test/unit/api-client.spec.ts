// Unit tests for src/api-client.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockFetch } from '../setup/mocks';
import { loginResponses, calendarResponses } from '../setup/fixtures';
import {
  login,
  fetchCalendar,
  isLoginSuccessful,
  isCalendarResponseValid,
} from '../../src/api-client';

describe('API Client', () => {
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mockFetch = createMockFetch();
    vi.stubGlobal('fetch', mockFetch.mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.reset();
  });

  describe('login()', () => {
    it('should send POST request to login endpoint', async () => {
      mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      await login('testuser', 'testpass');

      const calls = mockFetch.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('/api/login');
      expect(calls[0].method).toBe('POST');
    });

    it('should send credentials in request body', async () => {
      mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      await login('myaccount', 'mypassword');

      const calls = mockFetch.getCalls();
      expect(calls[0].body).toEqual({ account: 'myaccount', password: 'mypassword' });
    });

    it('should set Content-Type header to application/json', async () => {
      mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      await login('user', 'pass');

      const calls = mockFetch.getCalls();
      expect(calls[0].headers['Content-Type']).toBe('application/json');
    });

    it('should return login response on success', async () => {
      mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const result = await login('user', 'pass');

      expect(result.status).toBe(200);
      expect(result.code).toBe('410001');
      expect(result.data?.token).toBeDefined();
    });

    it('should return invalid credentials response', async () => {
      mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.invalidCredentials)));

      const result = await login('user', 'wrongpass');

      expect(result.code).toBe('410025');
      expect(result.data).toBeUndefined();
    });

    it('should throw ApiError on non-ok HTTP response', async () => {
      mockFetch.setResponse(/login/, new Response('Server Error', { status: 500 }));

      await expect(login('user', 'pass')).rejects.toThrow('status 500');
    });

    it('should throw ApiError on 401 response', async () => {
      mockFetch.setResponse(/login/, new Response('Unauthorized', { status: 401 }));

      await expect(login('user', 'pass')).rejects.toThrow('status 401');
    });

    it('should throw ApiError on timeout (AbortError)', async () => {
      mockFetch.setResponse(/login/, () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      });

      await expect(login('user', 'pass')).rejects.toThrow('timed out');
    });

    it('should throw ApiError on network error', async () => {
      mockFetch.setResponse(/login/, () => {
        throw new Error('Network error');
      });

      await expect(login('user', 'pass')).rejects.toThrow('Network error');
    });

    it('should throw ApiError on DNS resolution failure', async () => {
      mockFetch.setResponse(/login/, () => {
        throw new Error('getaddrinfo ENOTFOUND');
      });

      await expect(login('user', 'pass')).rejects.toThrow('ENOTFOUND');
    });
  });

  describe('fetchCalendar()', () => {
    it('should send POST request to calendar endpoint', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.valid)));

      await fetchCalendar('token123', '2026', '01');

      const calls = mockFetch.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('/api/v3/movie/getCalendar');
      expect(calls[0].method).toBe('POST');
    });

    it('should include Authorization header with bearer token', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.valid)));

      await fetchCalendar('my-secret-token', '2026', '01');

      const calls = mockFetch.getCalls();
      expect(calls[0].headers['Authorization']).toBe('Bearer my-secret-token');
    });

    it('should send year and month in request body', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.valid)));

      await fetchCalendar('token', '2026', '02');

      const calls = mockFetch.getCalls();
      expect(calls[0].body).toMatchObject({ year: '2026', month: '02' });
    });

    it('should include cinema_code in request body', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.valid)));

      await fetchCalendar('token', '2026', '01', 'cinema123');

      const calls = mockFetch.getCalls();
      expect(calls[0].body).toMatchObject({ cinema_code: 'cinema123' });
    });

    it('should use empty string as default cinema_code', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.valid)));

      await fetchCalendar('token', '2026', '01');

      const calls = mockFetch.getCalls();
      expect(calls[0].body.cinema_code).toBe('');
    });

    it('should return calendar data on success', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.valid)));

      const result = await fetchCalendar('token', '2026', '01');

      expect(result.status).toBe(200);
      expect(result.data?.list).toBeDefined();
      expect(result.data?.list.length).toBeGreaterThan(0);
    });

    it('should return response with status on 401 (for retry logic)', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(
        JSON.stringify({ msg: 'Unauthorized' }),
        { status: 401 }
      ));

      const result = await fetchCalendar('bad-token', '2026', '01');

      expect(result.status).toBe(401);
    });

    it('should return response with status on 403 (for retry logic)', async () => {
      mockFetch.setResponse(/getCalendar/, new Response(
        JSON.stringify({ msg: 'Forbidden' }),
        { status: 403 }
      ));

      const result = await fetchCalendar('expired-token', '2026', '01');

      expect(result.status).toBe(403);
    });

    it('should throw ApiError on timeout', async () => {
      mockFetch.setResponse(/getCalendar/, () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      });

      await expect(fetchCalendar('token', '2026', '01')).rejects.toThrow('timed out');
    });

    it('should throw ApiError on network error', async () => {
      mockFetch.setResponse(/getCalendar/, () => {
        throw new Error('Connection refused');
      });

      await expect(fetchCalendar('token', '2026', '01')).rejects.toThrow('Connection refused');
    });
  });

  describe('isLoginSuccessful()', () => {
    it('should return true for valid success response', () => {
      expect(isLoginSuccessful(loginResponses.success)).toBe(true);
    });

    it('should return false when status is not 200', () => {
      const response = { ...loginResponses.success, status: 401 };
      expect(isLoginSuccessful(response)).toBe(false);
    });

    it('should return false when code is not 410001', () => {
      const response = { ...loginResponses.success, code: '410002' };
      expect(isLoginSuccessful(response)).toBe(false);
    });

    it('should return false when data is undefined', () => {
      expect(isLoginSuccessful(loginResponses.invalidCredentials)).toBe(false);
    });

    it('should handle data being null (treated as defined)', () => {
      // Note: In JS, null !== undefined, so this actually returns true
      // This test documents the current behavior
      const response = { status: 200, code: '410001', msg: 'OK', data: null as any };
      // null is not undefined, so data !== undefined is true
      expect(isLoginSuccessful(response)).toBe(true);
    });

    it('should return false for server error response', () => {
      expect(isLoginSuccessful(loginResponses.serverError)).toBe(false);
    });
  });

  describe('isCalendarResponseValid()', () => {
    it('should return true for valid calendar response', () => {
      expect(isCalendarResponseValid(calendarResponses.valid)).toBe(true);
    });

    it('should return true for empty list response', () => {
      expect(isCalendarResponseValid(calendarResponses.empty)).toBe(true);
    });

    it('should return false when status is not 200', () => {
      expect(isCalendarResponseValid(calendarResponses.unauthorized)).toBe(false);
    });

    it('should return false for 403 response', () => {
      expect(isCalendarResponseValid(calendarResponses.forbidden)).toBe(false);
    });

    it('should return false when data is undefined', () => {
      expect(isCalendarResponseValid(calendarResponses.invalidData)).toBe(false);
    });

    it('should return false for server error response', () => {
      expect(isCalendarResponseValid(calendarResponses.serverError)).toBe(false);
    });

    it('should return false when list is not an array', () => {
      const response = {
        status: 200,
        msg: 'OK',
        data: { list: 'not-an-array', count: 0, data_type: 'calendar' },
      };
      expect(isCalendarResponseValid(response as any)).toBe(false);
    });

    it('should return false when list is null', () => {
      const response = {
        status: 200,
        msg: 'OK',
        data: { list: null, count: 0, data_type: 'calendar' },
      };
      expect(isCalendarResponseValid(response as any)).toBe(false);
    });
  });
});
