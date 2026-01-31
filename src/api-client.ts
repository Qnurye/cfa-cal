// API client for interacting with the remote calendar service
// Following Cloudflare best practices:
// - Proper error handling with typed errors
// - Request timeouts
// - Structured logging

import type { CalendarResponse, LoginResponse } from './models';
import { ApiError, AuthError } from './utils/errors';

const API_BASE = 'https://api.guoyingjiaying.cn';
const REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * Make a fetch request with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Login to the API service
 * @throws {AuthError} When login fails
 * @throws {ApiError} When API request fails
 */
export async function login(account: string, password: string): Promise<LoginResponse> {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    });

    if (!response.ok) {
      throw new ApiError(`Login request failed with status ${response.status}`, response.status);
    }

    const data = await response.json<LoginResponse>();
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Login request timed out');
    }
    throw new ApiError(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch calendar data for a specific month
 * @throws {ApiError} When API request fails
 */
export async function fetchCalendar(
  token: string,
  year: string,
  month: string,
  cinema_code = ''
): Promise<CalendarResponse> {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/v3/movie/getCalendar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ year, month, cinema_code }),
    });

    const data = await response.json<CalendarResponse>();

    // Pass through status for retry logic
    if (!response.ok) {
      return { ...data, status: response.status };
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Calendar request timed out');
    }
    throw new ApiError(`Failed to fetch calendar: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a login response indicates valid credentials
 */
export function isLoginSuccessful(response: LoginResponse): boolean {
  return response.status === 200 && response.code === '410001' && response.data !== undefined;
}

/**
 * Check if a calendar API response is valid
 */
export function isCalendarResponseValid(response: CalendarResponse): boolean {
  return response.status === 200 && response.data !== undefined && Array.isArray(response.data.list);
}
