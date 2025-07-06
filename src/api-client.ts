// api-client.ts
// API client for interacting with the remote calendar service

import { CalendarResponse, LoginResponse } from './models';

/**
 * Login to the API service
 * @param account - The account username
 * @param password - The account password
 * @returns The login response with token if successful
 */
export async function login(account: string, password: string): Promise<LoginResponse> {
  const response = await fetch('https://api.guoyingjiaying.cn/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account,
      password,
    }),
  });

	return await response.json();
}

/**
 * Fetch calendar data for a specific month
 * @param token - The access token from login
 * @param year - The year to fetch (e.g. "2025")
 * @param month - The month to fetch (e.g. "07", zero-padded)
 * @param cinema_code - Optional cinema code filter
 * @returns Calendar response with events data
 */
export async function fetchCalendar(
  token: string,
  year: string,
  month: string,
  cinema_code: string = ''
): Promise<CalendarResponse> {
  const response = await fetch('https://api.guoyingjiaying.cn/api/v3/movie/getCalendar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      year,
      month,
      cinema_code,
    }),
  });

	return await response.json();
}

/**
 * Check if a login response indicates valid credentials
 * @param loginResponse - The login response from API
 * @returns true if login was successful
 */
export function isLoginSuccessful(loginResponse: LoginResponse): boolean {
  return (
    loginResponse.status === 200 &&
    loginResponse.code === '410001' &&
    loginResponse.data !== undefined
  );
}

/**
 * Check if a calendar API response is valid
 * @param calendarResponse - The calendar response from API
 * @returns true if the response contains valid calendar data
 */
export function isCalendarResponseValid(calendarResponse: CalendarResponse): boolean {
  return (
    calendarResponse.status === 200 &&
    calendarResponse.data !== undefined &&
    Array.isArray(calendarResponse.data.list)
  );
}
