// Response utilities following Cloudflare best practices
// - Proper Cache-Control headers
// - CORS support
// - Consistent response formatting

import type { Context } from 'hono';

/** Default CORS headers */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Cache durations in seconds */
export const CACHE = {
  NONE: 0,
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

interface JsonOptions {
  status?: number;
  cache?: number;
  headers?: Record<string, string>;
}

/**
 * Return JSON response with proper headers and caching
 */
export function json<T>(c: Context, data: T, options: JsonOptions = {}): Response {
  const { status = 200, cache = CACHE.NONE, headers = {} } = options;

  const cacheHeader = cache > 0
    ? `public, max-age=${cache}, s-maxage=${cache}`
    : 'no-store';

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheHeader,
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

/**
 * Return ICS calendar response with proper headers
 */
export function ics(c: Context, content: string, filename = 'calendar.ics'): Response {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': `public, max-age=${CACHE.MEDIUM}`,
      ...CORS_HEADERS,
    },
  });
}

/**
 * Return error response with consistent format
 */
export function error(c: Context, message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message, success: false }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

/**
 * Return success response with consistent format
 */
export function success<T>(c: Context, data: T, message?: string): Response {
  return json(c, { success: true, data, ...(message && { message }) });
}
