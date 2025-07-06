// services.ts
// Business logic for calendar data management

import { fetchCalendar, isCalendarResponseValid, isLoginSuccessful, login } from './api-client';
import { CalendarDay, CalendarEvent, CalendarResponse, KVStorage } from './models';

/**
 * Auth service functions
 */
export class AuthService {
  constructor(private env: Env) {
  }

  /**
   * Get the stored access token, or return null if not present or expired
   */
  async getValidAccessToken(): Promise<string | null> {
    const kvData = await this.getKVData();
    const now = Date.now();

    // Check if token exists and isn't expired
    if (
      kvData.access_token &&
      kvData.token_expires_at &&
      kvData.token_expires_at > now
    ) {
      return kvData.access_token;
    }

    return null;
  }

  /**
   * Authenticate with the API and store the token
   */
  async authenticate(): Promise<string | null> {
    // Get credentials from environment variables
    const account = this.env.API_ACCOUNT;
    const password = this.env.API_PASSWORD;

    if (!account || !password) {
      console.error('Missing API credentials in environment variables');
      return null;
    }

    try {
      const loginResponse = await login(account, password);

      if (isLoginSuccessful(loginResponse)) {
        const { token, expires_time } = loginResponse.data!;

        // Store token and expiry time in KV
        await this.updateKVData({
          access_token: token,
          token_expires_at: expires_time * 1000 // Convert to milliseconds
        });

        return token;
      }
      else {
        console.error('Login failed:', loginResponse.msg);
        return null;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  /**
   * Get the current KV data
   */
  private async getKVData(): Promise<KVStorage> {
    try {
      const data = await this.env.CFA_CAL_KV.get('auth', 'json');
      return data || {};
    } catch (error) {
      console.error('Error retrieving KV data:', error);
      return {};
    }
  }

  /**
   * Update KV data with new values (partial update)
   */
  private async updateKVData(newData: Partial<KVStorage>): Promise<void> {
    try {
      const existingData = await this.getKVData();
      const updatedData = { ...existingData, ...newData };
      await this.env.CFA_CAL_KV.put('auth', JSON.stringify(updatedData));
    } catch (error) {
      console.error('Error updating KV data:', error);
    }
  }
}

/**
 * Calendar service for handling calendar data
 */
export class CalendarService {
  constructor(private env: Env, private authService: AuthService) {
  }

  /**
   * Fetch calendar data for a specific month
   */
  async fetchMonthCalendar(year: string, month: string): Promise<CalendarResponse | null> {
    try {
      // Get token or authenticate if needed
      let token = await this.authService.getValidAccessToken();

      if (!token) {
        token = await this.authService.authenticate();
        if (!token) {
          throw new Error('Failed to authenticate');
        }
      }

      // Fetch calendar data
      const calendarData = await fetchCalendar(token, year, month);

      if (isCalendarResponseValid(calendarData)) {
        return calendarData;
      }
      else {
        // Check if token might be expired despite our local expiry check
        if (calendarData.status === 401 || calendarData.status === 403) {
          // Try re-authenticating once
          const newToken = await this.authService.authenticate();
          if (newToken) {
            const retryData = await fetchCalendar(newToken, year, month);
            if (isCalendarResponseValid(retryData)) {
              return retryData;
            }
          }
        }

        console.error('Failed to fetch valid calendar data:', calendarData.msg || 'Unknown error');
        return null;
      }
    } catch (error) {
      console.error('Error fetching calendar:', error);
      return null;
    }
  }

  /**
   * Store calendar data in the database
   */
  async storeCalendarData(calendarData: CalendarResponse): Promise<boolean> {
    if (!calendarData.data || !Array.isArray(calendarData.data.list)) {
      return false;
    }

    const { list } = calendarData.data;
    const timestamp = new Date().toISOString();

    try {
      const db = this.env.DB;
      if (list.length === 0) {
        return false;
      }
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1; // 1-12

      const session = db.withSession('first-primary');
      try {
        for (const day of list) {
          const date = `${year}-${month.toString().padStart(2, '0')}-${day.day.toString().padStart(2, '0')}`;
          const eventsCount = day.screen ? day.screen.length : 0;

          // Insert or update calendar day
          await session.prepare(`
              INSERT INTO calendar_days (day, month, year, date, have_activity, events_count, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (date)
            DO
              UPDATE SET
                  have_activity = excluded.have_activity,
                  events_count = excluded.events_count,
                  updated_at = excluded.updated_at
          `).bind(
            day.day,
            month,
            year,
            date,
            day.have_activity,
            eventsCount,
            timestamp,
            timestamp
          ).run();

          if (day.screen && day.screen.length > 0) {
            await session.prepare(`DELETE
                                   FROM calendar_events
                                   WHERE date = ?`).bind(date).run();
            for (const event of day.screen) {
              let eventDay = day.day;
              let eventMonth = month;
              let eventYear = year;
              let eventDate = date;
              if (event.screen_start_time) {
                try {
                  const startTime = new Date(event.screen_start_time);
                  eventDay = startTime.getDate();
                  eventMonth = startTime.getMonth() + 1;
                  eventYear = startTime.getFullYear();
                  eventDate = `${eventYear}-${eventMonth.toString().padStart(2, '0')}-${eventDay.toString().padStart(2, '0')}`;
                } catch (e) {
                }
              }
              await session.prepare(`
                  INSERT INTO calendar_events (id, show_name, film_area, film_type, film_year, screen_time_len,
                                               show_mode, show_type, program_ids, activity_ids, statu_verify,
                                               show_time, show_price, screen_up_time, screen_sales_time,
                                               screen_start_time, program_colle, screen_cinema, activity,
                                               have_activity, tags, cover_img1, date, day, month, year,
                                               created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?,
                          ?, ?, ?, ?, ?,
                          ?, ?, ?, ?,
                          ?, ?, ?, ?,
                          ?, ?, ?, ?, ?, ?, ?,
                          ?, ?)
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
                eventDate,
                eventDay,
                eventMonth,
                eventYear,
                timestamp,
                timestamp
              ).run();
            }
          }
        }
        await session.prepare(`
            INSERT INTO fetch_logs (status, year, month, message, events_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          'success',
          year,
          month,
          `Successfully fetched ${calendarData.data.count} events`,
          calendarData.data.count,
          timestamp
        ).run();
        return true;
      } catch (error) {
        console.error('Database error during calendar storage:', error);
        await session.prepare(`
            INSERT INTO fetch_logs (status, year, month, message, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).bind(
          'error',
          year,
          month,
          `Error storing calendar data: ${error || 'Unknown error'}`,
          timestamp
        ).run();
        return false;
      }
    } catch (error) {
      console.error('Error storing calendar data:', error);
      return false;
    }
  }

  /**
   * Get the current month's calendar data from D1
   */
  async getCurrentMonthCalendar(): Promise<{ days: CalendarDay[]; events: CalendarEvent[] }> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // 1-12

      // Query for the current month's days and events
      const days = await this.env.DB.prepare(`
          SELECT *
          FROM calendar_days
          WHERE year = ? AND month = ?
          ORDER BY day ASC
      `).bind(year, month).all();

      if (!days.results || days.results.length === 0) {
        return { days: [], events: [] };
      }

      const events = await this.env.DB.prepare(`
          SELECT *
          FROM calendar_events
          WHERE year = ? AND month = ?
          ORDER BY screen_start_time ASC
      `).bind(year, month).all();

      return {
        days: (days.results as unknown as CalendarDay[]),
        events: (events.results as unknown as CalendarEvent[]) || []
      };
    } catch (error) {
      console.error('Error retrieving calendar data from database:', error);
      return { days: [], events: [] };
    }
  }

  /**
   * Check if we need to update the calendar data
   */
  async shouldUpdateCalendar(): Promise<boolean> {
    try {
      // Get the last fetch time from KV
      const kvData = await this.env.CFA_CAL_KV.get('last_fetch', 'json') as { time?: number } | null;
      const now = Date.now();

      // If no previous fetch or it was more than 12 hours ago, we should update
      if (!kvData || !kvData.time || (now - kvData.time > 12 * 60 * 60 * 1000)) {
        return true;
      }

      // Otherwise, check if we have data for the current month
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1; // 1-12

      const result = await this.env.DB.prepare(`
          SELECT COUNT(*) as count
          FROM calendar_days
          WHERE year = ? AND month = ?
      `).bind(year, month).first();

      // If we have no data for the current month, we should update
      return !result || result.count === 0;
    } catch (error) {
      console.error('Error checking if calendar update is needed:', error);
      // If there's an error, default to updating to be safe
      return true;
    }
  }

  /**
   * Update the last fetch time in KV
   */
  async updateLastFetchTime(): Promise<void> {
    try {
      await this.env.CFA_CAL_KV.put('last_fetch', JSON.stringify({ time: Date.now() }));
    } catch (error) {
      console.error('Error updating last fetch time:', error);
    }
  }
}
