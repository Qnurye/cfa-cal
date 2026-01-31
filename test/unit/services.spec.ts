// Unit tests for src/services.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestEnv } from '../setup/mocks';
import { loginResponses, calendarResponses } from '../setup/fixtures';
import { AuthService, CalendarService } from '../../src/services';
import { AuthError } from '../../src/utils/errors';

describe('AuthService', () => {
  let testEnv: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    testEnv = createTestEnv();
    testEnv.stubFetch();
  });

  afterEach(() => {
    testEnv.reset();
  });

  describe('getValidAccessToken()', () => {
    it('should return cached token if not expired', async () => {
      // Set up cached token in KV
      testEnv.mockKV.setData('auth', {
        access_token: 'cached-token-xyz',
        token_expires_at: Date.now() + 3600000, // 1 hour from now
      });

      const service = new AuthService(testEnv.env);
      const token = await service.getValidAccessToken();

      expect(token).toBe('cached-token-xyz');
      expect(testEnv.mockFetch.getCallCount(/login/)).toBe(0);
    });

    it('should authenticate when token is expired', async () => {
      // Set up expired token in KV
      testEnv.mockKV.setData('auth', {
        access_token: 'old-expired-token',
        token_expires_at: Date.now() - 1000, // Expired 1 second ago
      });

      // Mock successful login
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new AuthService(testEnv.env);
      const token = await service.getValidAccessToken();

      expect(token).toBe(loginResponses.success.data!.token);
      expect(testEnv.mockFetch.getCallCount(/login/)).toBe(1);
    });

    it('should authenticate when no token exists', async () => {
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new AuthService(testEnv.env);
      const token = await service.getValidAccessToken();

      expect(token).toBe(loginResponses.success.data!.token);
      expect(testEnv.mockFetch.getCallCount(/login/)).toBe(1);
    });

    it('should authenticate when KV returns empty object', async () => {
      testEnv.mockKV.setData('auth', {});
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new AuthService(testEnv.env);
      const token = await service.getValidAccessToken();

      expect(token).toBe(loginResponses.success.data!.token);
    });
  });

  describe('authenticate()', () => {
    it('should throw AuthError when API_ACCOUNT is missing', async () => {
      const envWithoutAccount = { ...testEnv.env, API_ACCOUNT: '' };
      const service = new AuthService(envWithoutAccount);

      await expect(service.authenticate()).rejects.toThrow(AuthError);
      await expect(service.authenticate()).rejects.toThrow('Missing API credentials');
    });

    it('should throw AuthError when API_PASSWORD is missing', async () => {
      const envWithoutPassword = { ...testEnv.env, API_PASSWORD: '' };
      const service = new AuthService(envWithoutPassword);

      await expect(service.authenticate()).rejects.toThrow(AuthError);
      await expect(service.authenticate()).rejects.toThrow('Missing API credentials');
    });

    it('should throw AuthError when login fails', async () => {
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.invalidCredentials)));

      const service = new AuthService(testEnv.env);

      await expect(service.authenticate()).rejects.toThrow(AuthError);
      await expect(service.authenticate()).rejects.toThrow(loginResponses.invalidCredentials.msg);
    });

    it('should return token on successful login', async () => {
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new AuthService(testEnv.env);
      const token = await service.authenticate();

      expect(token).toBe(loginResponses.success.data!.token);
    });

    it('should store token in KV on success', async () => {
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new AuthService(testEnv.env);
      await service.authenticate();

      const storedData = testEnv.mockKV.getData('auth');
      expect(storedData.access_token).toBe(loginResponses.success.data!.token);
      expect(storedData.token_expires_at).toBe(loginResponses.success.data!.expires_time * 1000);
    });

    it('should use credentials from environment', async () => {
      const customEnv = {
        ...testEnv.env,
        API_ACCOUNT: 'custom_account',
        API_PASSWORD: 'custom_password',
      };
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new AuthService(customEnv);
      await service.authenticate();

      const calls = testEnv.mockFetch.getCalls();
      expect(calls[0].body).toEqual({
        account: 'custom_account',
        password: 'custom_password',
      });
    });
  });
});

describe('CalendarService', () => {
  let testEnv: ReturnType<typeof createTestEnv>;
  let authService: AuthService;

  beforeEach(() => {
    testEnv = createTestEnv();
    testEnv.stubFetch();

    // Set up valid token in KV by default
    testEnv.mockKV.setData('auth', {
      access_token: 'valid-test-token',
      token_expires_at: Date.now() + 3600000,
    });

    authService = new AuthService(testEnv.env);
  });

  afterEach(() => {
    testEnv.reset();
  });

  describe('fetchMonthCalendar()', () => {
    it('should return calendar data on success', async () => {
      testEnv.mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.valid)));

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.fetchMonthCalendar('2026', '01');

      expect(result).not.toBeNull();
      expect(result?.status).toBe(200);
      expect(result?.data?.list).toHaveLength(2);
    });

    it('should retry with fresh token on 401', async () => {
      // First call returns 401, second returns success
      testEnv.mockFetch.setResponse(/getCalendar/, [
        new Response(JSON.stringify({ status: 401, msg: 'Unauthorized' }), { status: 401 }),
        new Response(JSON.stringify(calendarResponses.valid)),
      ]);

      // Mock successful re-authentication
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.fetchMonthCalendar('2026', '01');

      expect(result?.status).toBe(200);
      expect(testEnv.mockFetch.getCallCount(/getCalendar/)).toBe(2);
      expect(testEnv.mockFetch.getCallCount(/login/)).toBe(1);
    });

    it('should retry with fresh token on 403', async () => {
      testEnv.mockFetch.setResponse(/getCalendar/, [
        new Response(JSON.stringify({ status: 403, msg: 'Forbidden' }), { status: 403 }),
        new Response(JSON.stringify(calendarResponses.valid)),
      ]);
      testEnv.mockFetch.setResponse(/login/, new Response(JSON.stringify(loginResponses.success)));

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.fetchMonthCalendar('2026', '01');

      expect(result?.status).toBe(200);
    });

    it('should return null on invalid response', async () => {
      testEnv.mockFetch.setResponse(/getCalendar/, new Response(JSON.stringify(calendarResponses.invalidData)));

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.fetchMonthCalendar('2026', '01');

      expect(result).toBeNull();
    });

    it('should return null and log error on exception', async () => {
      testEnv.mockFetch.setResponse(/getCalendar/, () => {
        throw new Error('Network error');
      });

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.fetchMonthCalendar('2026', '01');

      expect(result).toBeNull();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('storeCalendarData()', () => {
    it('should return false for empty data', async () => {
      const service = new CalendarService(testEnv.env, authService);
      const result = await service.storeCalendarData({ status: 200, msg: 'OK' });

      expect(result).toBe(false);
    });

    it('should return false for empty list', async () => {
      const service = new CalendarService(testEnv.env, authService);
      const result = await service.storeCalendarData(calendarResponses.empty);

      expect(result).toBe(false);
    });

    it('should execute database operations for valid data', async () => {
      const service = new CalendarService(testEnv.env, authService);
      const result = await service.storeCalendarData(calendarResponses.valid);

      expect(result).toBe(true);

      // Verify queries were executed
      const queries = testEnv.mockD1.getExecutedQueries();
      expect(queries.some(q => q.sql.includes('calendar_days'))).toBe(true);
    });

    it('should handle database operations gracefully', async () => {
      // The mock D1 currently returns success for all operations
      // This test verifies the happy path completes
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.storeCalendarData(calendarResponses.valid);

      // With current mock, operations succeed
      expect(result).toBe(true);

      consoleError.mockRestore();
    });
  });

  describe('getCurrentMonthCalendar()', () => {
    it('should return days and events from database', async () => {
      const mockDays = [{ day: 1, month: 1, year: 2026 }];
      const mockEvents = [{ id: 1, show_name: 'Test Movie' }];

      testEnv.mockD1.setBatchResults([
        { results: mockDays, success: true },
        { results: mockEvents, success: true },
      ]);

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.getCurrentMonthCalendar();

      expect(result.days).toEqual(mockDays);
      expect(result.events).toEqual(mockEvents);
    });

    it('should return empty arrays on database error', async () => {
      testEnv.mockD1.setQueryResult('SELECT', () => {
        throw new Error('Query timeout');
      });

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.getCurrentMonthCalendar();

      expect(result).toEqual({ days: [], events: [] });

      consoleError.mockRestore();
    });
  });

  describe('shouldUpdateCalendar()', () => {
    it('should return true when no last fetch time', async () => {
      const service = new CalendarService(testEnv.env, authService);
      const result = await service.shouldUpdateCalendar();

      expect(result).toBe(true);
    });

    it('should return true when last fetch is stale (>12 hours)', async () => {
      testEnv.mockKV.setData('last_fetch', {
        time: Date.now() - 13 * 60 * 60 * 1000, // 13 hours ago
      });

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.shouldUpdateCalendar();

      expect(result).toBe(true);
    });

    it('should return false when data is fresh and exists', async () => {
      testEnv.mockKV.setData('last_fetch', {
        time: Date.now() - 1000, // 1 second ago
      });
      testEnv.mockD1.setQueryResult('SELECT COUNT', { count: 10 });

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.shouldUpdateCalendar();

      expect(result).toBe(false);
    });

    it('should return true when fetch is fresh but no data exists', async () => {
      testEnv.mockKV.setData('last_fetch', {
        time: Date.now() - 1000,
      });
      testEnv.mockD1.setQueryResult('SELECT COUNT', { count: 0 });

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.shouldUpdateCalendar();

      expect(result).toBe(true);
    });

    it('should return true on any error', async () => {
      testEnv.mockD1.setQueryResult('SELECT COUNT', () => {
        throw new Error('Database error');
      });

      const service = new CalendarService(testEnv.env, authService);
      const result = await service.shouldUpdateCalendar();

      expect(result).toBe(true);
    });

    it('should return true when KV returns null', async () => {
      // No data set in KV, will return null
      const service = new CalendarService(testEnv.env, authService);
      const result = await service.shouldUpdateCalendar();

      expect(result).toBe(true);
    });
  });

  describe('updateLastFetchTime()', () => {
    it('should store current timestamp in KV', async () => {
      const before = Date.now();

      const service = new CalendarService(testEnv.env, authService);
      await service.updateLastFetchTime();

      const after = Date.now();
      const stored = testEnv.mockKV.getData('last_fetch');

      expect(stored.time).toBeGreaterThanOrEqual(before);
      expect(stored.time).toBeLessThanOrEqual(after);
    });

    it('should overwrite previous timestamp', async () => {
      testEnv.mockKV.setData('last_fetch', { time: 1000 });

      const service = new CalendarService(testEnv.env, authService);
      await service.updateLastFetchTime();

      const stored = testEnv.mockKV.getData('last_fetch');
      expect(stored.time).toBeGreaterThan(1000);
    });
  });
});
