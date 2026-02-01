// Business logic for calendar data management
// Following Cloudflare best practices:
// - Batched D1 operations for performance
// - Proper error handling with typed errors
// - Clean separation of concerns

import { fetchCalendar, isCalendarResponseValid, isLoginSuccessful, login } from './api-client';
import type { CalendarDay, CalendarEvent, CalendarResponse, EventFilters, KVStorage, PaginationMeta } from './models';
import { findMovieWithImdbId, TMDbRateLimitError } from './tmdb-client';
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
   * Also enriches events with TMDb data if API key is configured
   */
  async refreshThreeMonthsCalendar(): Promise<{
    success: boolean;
    monthsRefreshed: number;
    monthsFailed: number;
    tmdbEnriched: number;
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

    // Enrich events with TMDb data after storing
    const tmdbEnriched = await this.enrichPendingEventsWithTMDb();

    return {
      success: storedCount > 0,
      monthsRefreshed: storedCount,
      monthsFailed: fetchResult.failureCount + (fetchResult.successCount - storedCount),
      tmdbEnriched,
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

  /**
   * Get a single event by ID
   */
  async getEventById(id: number): Promise<CalendarEvent | null> {
    try {
      const result = await this.env.DB.prepare(
        'SELECT * FROM calendar_events WHERE id = ?'
      ).bind(id).first<CalendarEvent>();
      return result || null;
    } catch (error) {
      console.error('[CalendarService] getEventById failed:', error);
      return null;
    }
  }

  /**
   * Search events with filters and pagination
   */
  async searchEvents(
    filters: EventFilters,
    query?: string,
    page = 1,
    limit = 20
  ): Promise<{ events: CalendarEvent[]; meta: PaginationMeta }> {
    const conditions: string[] = [];
    const bindings: (string | number)[] = [];

    // Build filter conditions
    if (filters.date) {
      conditions.push('date = ?');
      bindings.push(filters.date);
    }
    if (filters.startDate) {
      conditions.push('date >= ?');
      bindings.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push('date <= ?');
      bindings.push(filters.endDate);
    }
    if (filters.city) {
      // City filtering uses screen_cinema keyword matching
      conditions.push('screen_cinema LIKE ?');
      bindings.push(`%${filters.city}%`);
    }
    if (filters.cinema) {
      conditions.push('screen_cinema LIKE ?');
      bindings.push(`%${filters.cinema}%`);
    }
    if (filters.hall) {
      conditions.push('screen_cinema LIKE ?');
      bindings.push(`%${filters.hall}%`);
    }

    // Search query matches show_name or activity
    if (query) {
      conditions.push('(show_name LIKE ? OR activity LIKE ?)');
      bindings.push(`%${query}%`, `%${query}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    try {
      // Count total matching events
      const countQuery = `SELECT COUNT(*) as total FROM calendar_events ${whereClause}`;
      const countResult = await this.env.DB.prepare(countQuery).bind(...bindings).first<{ total: number }>();
      const total = countResult?.total || 0;

      // Fetch paginated results
      const dataQuery = `SELECT * FROM calendar_events ${whereClause} ORDER BY screen_start_time ASC LIMIT ? OFFSET ?`;
      const dataResult = await this.env.DB.prepare(dataQuery).bind(...bindings, limit, offset).all<CalendarEvent>();

      return {
        events: dataResult.results || [],
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('[CalendarService] searchEvents failed:', error);
      return {
        events: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }
  }

  /**
   * Get aggregate statistics for events
   */
  async getStats(): Promise<{
    totalEvents: number;
    eventsByCity: Record<string, number>;
    eventsByDate: Record<string, number>;
    dateRange: { start: string | null; end: string | null };
  }> {
    try {
      const [totalResult, datesResult, rangeResult] = await this.env.DB.batch([
        this.env.DB.prepare('SELECT COUNT(*) as total FROM calendar_events'),
        this.env.DB.prepare('SELECT date, COUNT(*) as count FROM calendar_events GROUP BY date ORDER BY date'),
        this.env.DB.prepare('SELECT MIN(date) as start, MAX(date) as end FROM calendar_events'),
      ]);

      const total = (totalResult.results?.[0] as { total: number } | undefined)?.total || 0;
      const datesData = (datesResult.results || []) as { date: string; count: number }[];
      const range = rangeResult.results?.[0] as { start: string | null; end: string | null } | undefined;

      // Build eventsByDate map
      const eventsByDate: Record<string, number> = {};
      for (const row of datesData) {
        eventsByDate[row.date] = row.count;
      }

      // Build eventsByCity based on screen_cinema patterns
      // This is a simplified approach - counts events by location keywords
      const cityKeywords = ['小西天', '百子湾', '江南'];
      const eventsByCity: Record<string, number> = {};

      for (const keyword of cityKeywords) {
        const result = await this.env.DB.prepare(
          'SELECT COUNT(*) as count FROM calendar_events WHERE screen_cinema LIKE ?'
        ).bind(`%${keyword}%`).first<{ count: number }>();
        if (result && result.count > 0) {
          eventsByCity[keyword] = result.count;
        }
      }

      return {
        totalEvents: total,
        eventsByCity,
        eventsByDate,
        dateRange: {
          start: range?.start || null,
          end: range?.end || null,
        },
      };
    } catch (error) {
      console.error('[CalendarService] getStats failed:', error);
      return {
        totalEvents: 0,
        eventsByCity: {},
        eventsByDate: {},
        dateRange: { start: null, end: null },
      };
    }
  }

  /**
   * Get API status including cache/refresh info
   */
  async getStatus(): Promise<{
    healthy: boolean;
    lastFetch: string | null;
    cacheAge: number | null;
    monthsCovered: string[];
  }> {
    try {
      const kvData = await this.env.CFA_CAL_KV.get<{ time?: number }>('last_fetch', 'json');
      const now = Date.now();

      const lastFetchTime = kvData?.time || null;
      const cacheAge = lastFetchTime ? Math.floor((now - lastFetchTime) / 1000) : null;

      // Get distinct months with data
      const monthsResult = await this.env.DB.prepare(
        'SELECT DISTINCT year, month FROM calendar_days ORDER BY year, month'
      ).all<{ year: number; month: number }>();

      const monthsCovered = (monthsResult.results || []).map(
        (row) => `${row.year}-${String(row.month).padStart(2, '0')}`
      );

      return {
        healthy: true,
        lastFetch: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
        cacheAge,
        monthsCovered,
      };
    } catch (error) {
      console.error('[CalendarService] getStatus failed:', error);
      return {
        healthy: false,
        lastFetch: null,
        cacheAge: null,
        monthsCovered: [],
      };
    }
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
        created_at, updated_at, tmdb_id, imdb_id, tmdb_lookup_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      timestamp,
      null, // tmdb_id - will be enriched later
      null, // imdb_id - will be enriched later
      'pending' // tmdb_lookup_status
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

  /**
   * Enrich pending events with TMDb data (movie IDs)
   * Processes up to maxEvents events per call to avoid rate limits
   * @returns Number of events enriched
   */
  async enrichPendingEventsWithTMDb(maxEvents: number = 20): Promise<number> {
    const apiKey = this.env.TMDB_API_KEY;

    // Skip if no API key configured
    if (!apiKey) {
      console.log('[CalendarService] TMDb API key not configured, skipping enrichment');
      return 0;
    }

    try {
      // Get unique show names with pending lookup status
      // Group by show_name to avoid duplicate API calls for the same movie
      const pendingEvents = await this.env.DB.prepare(`
        SELECT DISTINCT show_name, film_year
        FROM calendar_events
        WHERE tmdb_lookup_status = 'pending'
        LIMIT ?
      `).bind(maxEvents).all<{ show_name: string; film_year: string | null }>();

      if (!pendingEvents.results?.length) {
        return 0;
      }

      let enrichedCount = 0;

      for (const event of pendingEvents.results) {
        try {
          const movieInfo = await findMovieWithImdbId(apiKey, event.show_name, event.film_year);

          if (movieInfo) {
            // Update all events with this show_name
            await this.env.DB.prepare(`
              UPDATE calendar_events
              SET tmdb_id = ?, imdb_id = ?, tmdb_lookup_status = 'found', updated_at = ?
              WHERE show_name = ? AND tmdb_lookup_status = 'pending'
            `).bind(
              movieInfo.tmdb_id,
              movieInfo.imdb_id,
              new Date().toISOString(),
              event.show_name
            ).run();

            enrichedCount++;
            console.log(`[CalendarService] Enriched "${event.show_name}" with TMDb ID: ${movieInfo.tmdb_id}`);
          } else {
            // Mark as not found
            await this.env.DB.prepare(`
              UPDATE calendar_events
              SET tmdb_lookup_status = 'not_found', updated_at = ?
              WHERE show_name = ? AND tmdb_lookup_status = 'pending'
            `).bind(new Date().toISOString(), event.show_name).run();

            console.log(`[CalendarService] No TMDb match for "${event.show_name}"`);
          }
        } catch (error) {
          if (error instanceof TMDbRateLimitError) {
            // Stop processing on rate limit, will continue next sync cycle
            console.warn('[CalendarService] TMDb rate limit hit, stopping enrichment');
            break;
          }

          // Mark as error for this specific movie
          await this.env.DB.prepare(`
            UPDATE calendar_events
            SET tmdb_lookup_status = 'error', updated_at = ?
            WHERE show_name = ? AND tmdb_lookup_status = 'pending'
          `).bind(new Date().toISOString(), event.show_name).run();

          console.error(`[CalendarService] TMDb error for "${event.show_name}":`, error);
        }
      }

      return enrichedCount;
    } catch (error) {
      console.error('[CalendarService] TMDb enrichment failed:', error);
      return 0;
    }
  }
}
