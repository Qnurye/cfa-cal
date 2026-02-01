// Business logic for calendar data management
// Following Cloudflare best practices:
// - Batched D1 operations for performance
// - Proper error handling with typed errors
// - Clean separation of concerns

import { fetchCalendar, isCalendarResponseValid, isLoginSuccessful, login } from './api-client';
import type { CalendarDay, CalendarEvent, CalendarResponse, KVStorage } from './models';
import type { Env } from './types';
import { AuthError, DatabaseError } from './utils/errors';

/** Cache duration for calendar data (12 hours in ms) */
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;

/** Represents a year-month tuple */
interface YearMonth {
  year: number;
  month: number;
}

/**
 * Get three consecutive months: previous, current, and next
 * Handles year boundaries correctly (e.g., January -> December of previous year)
 */
export function getThreeMonthRange(referenceDate: Date = new Date()): {
  previous: YearMonth;
  current: YearMonth;
  next: YearMonth;
} {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1; // 1-indexed

  // Previous month
  const previous: YearMonth = month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };

  // Current month
  const current: YearMonth = { year, month };

  // Next month
  const next: YearMonth = month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };

  return { previous, current, next };
}

/**
 * Authentication service for managing API tokens
 */
export class AuthService {
  constructor(private readonly env: Env) {}

  /**
   * Get a valid access token, authenticating if necessary
   * @throws {AuthError} When authentication fails
   */
  async getValidAccessToken(): Promise<string> {
    const kvData = await this.getKVData();
    const now = Date.now();

    // Return existing token if valid
    if (kvData.access_token && kvData.token_expires_at && kvData.token_expires_at > now) {
      return kvData.access_token;
    }

    // Need to authenticate
    return this.authenticate();
  }

  /**
   * Authenticate with the API and store the token
   * @throws {AuthError} When credentials are missing or login fails
   */
  async authenticate(): Promise<string> {
    const { API_ACCOUNT, API_PASSWORD } = this.env;

    if (!API_ACCOUNT || !API_PASSWORD) {
      throw new AuthError('Missing API credentials in environment');
    }

    const response = await login(API_ACCOUNT, API_PASSWORD);

    if (!isLoginSuccessful(response)) {
      throw new AuthError(response.msg || 'Login failed');
    }

    const { token, expires_time } = response.data!;

    // Store token with expiry
    await this.updateKVData({
      access_token: token,
      token_expires_at: expires_time * 1000,
    });

    return token;
  }

  private async getKVData(): Promise<KVStorage> {
    try {
      return (await this.env.CFA_CAL_KV.get('auth', 'json')) || {};
    } catch {
      return {};
    }
  }

  private async updateKVData(newData: Partial<KVStorage>): Promise<void> {
    const existingData = await this.getKVData();
    await this.env.CFA_CAL_KV.put('auth', JSON.stringify({ ...existingData, ...newData }));
  }
}

/**
 * Calendar service for fetching and storing calendar data
 */
export class CalendarService {
  constructor(
    private readonly env: Env,
    private readonly authService: AuthService
  ) {}

  /**
   * Fetch calendar data for a specific month with automatic retry on auth failure
   */
  async fetchMonthCalendar(year: string, month: string): Promise<CalendarResponse | null> {
    try {
      let token = await this.authService.getValidAccessToken();
      let response = await fetchCalendar(token, year, month);

      // Handle token expiry (retry once with fresh token)
      if (response.status === 401 || response.status === 403) {
        token = await this.authService.authenticate();
        response = await fetchCalendar(token, year, month);
      }

      return isCalendarResponseValid(response) ? response : null;
    } catch (error) {
      console.error('[CalendarService] Fetch failed:', error);
      return null;
    }
  }

  /**
   * Store calendar data using batched D1 operations for performance
   * @param calendarData - The calendar response from API
   * @param targetYear - The year for the data (defaults to current year)
   * @param targetMonth - The month for the data (defaults to current month)
   * @throws {DatabaseError} When database operations fail
   */
  async storeCalendarData(
    calendarData: CalendarResponse,
    targetYear?: number,
    targetMonth?: number
  ): Promise<boolean> {
    if (!calendarData.data?.list?.length) {
      return false;
    }

    const { list } = calendarData.data;
    const timestamp = new Date().toISOString();
    const now = new Date();
    const year = targetYear ?? now.getFullYear();
    const month = targetMonth ?? (now.getMonth() + 1);

    try {
      const db = this.env.DB;
      const statements: D1PreparedStatement[] = [];

      // Build batch of day upserts
      for (const day of list) {
        const date = this.formatDate(year, month, day.day);
        const eventsCount = day.screen?.length || 0;

        statements.push(
          db.prepare(`
            INSERT INTO calendar_days (day, month, year, date, have_activity, events_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (date) DO UPDATE SET
              have_activity = excluded.have_activity,
              events_count = excluded.events_count,
              updated_at = excluded.updated_at
          `).bind(day.day, month, year, date, day.have_activity, eventsCount, timestamp, timestamp)
        );

        // Delete existing events for this date before inserting new ones
        if (day.screen?.length) {
          statements.push(db.prepare('DELETE FROM calendar_events WHERE date = ?').bind(date));

          // Add event inserts
          for (const event of day.screen) {
            const eventDate = this.extractEventDate(event.screen_start_time, year, month, day.day);
            statements.push(this.buildEventInsert(db, event, eventDate, timestamp));
          }
        }
      }

      // Add fetch log
      statements.push(
        db.prepare(`
          INSERT INTO fetch_logs (status, year, month, message, events_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind('success', year, month, `Fetched ${calendarData.data.count} events`, calendarData.data.count, timestamp)
      );

      // Execute all statements in a batch
      await db.batch(statements);
      return true;
    } catch (error) {
      console.error('[CalendarService] Store failed:', error);
      await this.logFetchError(year, month, error);
      return false;
    }
  }

  /**
   * Fetch multiple months of calendar data in parallel
   * Note: fetchMonthCalendar() internally catches all errors and returns null on failure,
   * so Promise.all() is safe here - promises never reject.
   */
  async fetchMultipleMonths(months: { year: number; month: number }[]): Promise<{
    results: { year: number; month: number; data: CalendarResponse | null; success: boolean }[];
    successCount: number;
    failureCount: number;
  }> {
    const results = await Promise.all(
      months.map(async ({ year, month }) => {
        const yearStr = year.toString();
        const monthStr = String(month).padStart(2, '0');
        const data = await this.fetchMonthCalendar(yearStr, monthStr);
        return { year, month, data, success: data !== null };
      })
    );

    return {
      results,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
    };
  }

  /**
   * Refresh calendar data for three months (previous, current, next)
   * Partial failures are tolerated - successful months are still stored
   */
  async refreshThreeMonthsCalendar(): Promise<{
    success: boolean;
    monthsRefreshed: number;
    monthsFailed: number;
  }> {
    const range = getThreeMonthRange();
    const months = [range.previous, range.current, range.next];

    const fetchResult = await this.fetchMultipleMonths(months);

    // Store sequentially to avoid D1 concurrent write issues.
    // Each storeCalendarData() executes a batch of statements that may conflict
    // if run in parallel (e.g., DELETE + INSERT on same dates).
    let storedCount = 0;
    for (const result of fetchResult.results) {
      if (result.success && result.data) {
        const stored = await this.storeCalendarData(result.data, result.year, result.month);
        if (stored) {
          storedCount++;
        }
      }
    }

    return {
      success: storedCount > 0,
      monthsRefreshed: storedCount,
      monthsFailed: fetchResult.failureCount + (fetchResult.successCount - storedCount),
    };
  }

  /**
   * Get current month's calendar data from D1
   * @deprecated Use getThreeMonthsCalendar() instead for better coverage
   */
  async getCurrentMonthCalendar(): Promise<{ days: CalendarDay[]; events: CalendarEvent[] }> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    try {
      const [daysResult, eventsResult] = await this.env.DB.batch([
        this.env.DB.prepare('SELECT * FROM calendar_days WHERE year = ? AND month = ? ORDER BY day ASC').bind(year, month),
        this.env.DB.prepare('SELECT * FROM calendar_events WHERE year = ? AND month = ? ORDER BY screen_start_time ASC').bind(year, month),
      ]);

      return {
        days: (daysResult.results as unknown as CalendarDay[]) || [],
        events: (eventsResult.results as unknown as CalendarEvent[]) || [],
      };
    } catch (error) {
      console.error('[CalendarService] Query failed:', error);
      return { days: [], events: [] };
    }
  }

  /**
   * Get three months of calendar data from D1 (previous, current, next month)
   */
  async getThreeMonthsCalendar(): Promise<{ days: CalendarDay[]; events: CalendarEvent[] }> {
    const range = getThreeMonthRange();
    const months = [range.previous, range.current, range.next];

    try {
      // Build WHERE clause for three months
      const monthConditions = months.map(() => '(year = ? AND month = ?)').join(' OR ');
      const bindings = months.flatMap(m => [m.year, m.month]);

      const [daysResult, eventsResult] = await this.env.DB.batch([
        this.env.DB.prepare(`SELECT * FROM calendar_days WHERE ${monthConditions} ORDER BY year ASC, month ASC, day ASC`).bind(...bindings),
        this.env.DB.prepare(`SELECT * FROM calendar_events WHERE ${monthConditions} ORDER BY screen_start_time ASC`).bind(...bindings),
      ]);

      return {
        days: (daysResult.results as unknown as CalendarDay[]) || [],
        events: (eventsResult.results as unknown as CalendarEvent[]) || [],
      };
    } catch (error) {
      console.error('[CalendarService] Query failed:', error);
      return { days: [], events: [] };
    }
  }

  /**
   * Check if calendar data needs refresh (stale after 12 hours or missing any of three months)
   */
  async shouldUpdateCalendar(): Promise<boolean> {
    try {
      const kvData = await this.env.CFA_CAL_KV.get<{ time?: number }>('last_fetch', 'json');
      const now = Date.now();

      // Stale if no previous fetch or older than cache duration
      if (!kvData?.time || now - kvData.time > CACHE_DURATION_MS) {
        return true;
      }

      // Check if we have data for all three months in a single query
      const range = getThreeMonthRange();
      const months = [range.previous, range.current, range.next];
      const bindings = months.flatMap(m => [m.year, m.month]);

      // Count distinct year-month combinations that have data
      const result = await this.env.DB.prepare(`
        SELECT COUNT(DISTINCT year || '-' || month) as month_count
        FROM calendar_days
        WHERE (year = ? AND month = ?) OR (year = ? AND month = ?) OR (year = ? AND month = ?)
      `).bind(...bindings).first<{ month_count: number }>();

      // Need all 3 months to have data
      return !result || result.month_count < 3;
    } catch {
      return true; // Default to updating on error
    }
  }

  /**
   * Update the last fetch timestamp in KV
   */
  async updateLastFetchTime(): Promise<void> {
    await this.env.CFA_CAL_KV.put('last_fetch', JSON.stringify({ time: Date.now() }));
  }

  // Helper methods

  private formatDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private extractEventDate(startTime: string | undefined, fallbackYear: number, fallbackMonth: number, fallbackDay: number): { date: string; day: number; month: number; year: number } {
    if (startTime) {
      try {
        const d = new Date(startTime);
        if (!isNaN(d.getTime())) {
          return {
            date: this.formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
            day: d.getDate(),
            month: d.getMonth() + 1,
            year: d.getFullYear(),
          };
        }
      } catch {
        // Fall through to default
      }
    }
    return {
      date: this.formatDate(fallbackYear, fallbackMonth, fallbackDay),
      day: fallbackDay,
      month: fallbackMonth,
      year: fallbackYear,
    };
  }

  private buildEventInsert(db: D1Database, event: any, eventDate: ReturnType<typeof this.extractEventDate>, timestamp: string): D1PreparedStatement {
    return db.prepare(`
      INSERT INTO calendar_events (
        id, show_name, film_area, film_type, film_year, screen_time_len,
        show_mode, show_type, program_ids, activity_ids, statu_verify,
        show_time, show_price, screen_up_time, screen_sales_time,
        screen_start_time, program_colle, screen_cinema, activity,
        have_activity, tags, cover_img1, date, day, month, year,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event.id,
      event.show_name,
      event.film_area,
      event.film_type,
      event.film_year,
      event.screen_time_len,
      event.show_mode,
      event.show_type,
      event.program_ids,
      event.activity_ids,
      event.statu_verify,
      event.show_time,
      event.show_price,
      event.screen_up_time,
      event.screen_sales_time,
      event.screen_start_time,
      event.program_colle,
      event.screen_cinema,
      event.activity,
      event.have_activity,
      JSON.stringify(event.tags || []),
      event.cover_img1,
      eventDate.date,
      eventDate.day,
      eventDate.month,
      eventDate.year,
      timestamp,
      timestamp
    );
  }

  private async logFetchError(year: number, month: number, error: unknown): Promise<void> {
    try {
      await this.env.DB.prepare(`
        INSERT INTO fetch_logs (status, year, month, message, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind('error', year, month, `Error: ${error}`, new Date().toISOString()).run();
    } catch {
      // Ignore logging errors
    }
  }
}
