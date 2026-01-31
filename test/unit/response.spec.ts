// Unit tests for src/utils/response.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockContext } from '../setup/mocks';
import { CACHE, json, ics, error, success } from '../../src/utils/response';

describe('Response Utilities', () => {
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('CACHE constants', () => {
    it('should have correct NONE value (0 seconds)', () => {
      expect(CACHE.NONE).toBe(0);
    });

    it('should have correct SHORT value (60 seconds)', () => {
      expect(CACHE.SHORT).toBe(60);
    });

    it('should have correct MEDIUM value (300 seconds / 5 minutes)', () => {
      expect(CACHE.MEDIUM).toBe(300);
    });

    it('should have correct LONG value (3600 seconds / 1 hour)', () => {
      expect(CACHE.LONG).toBe(3600);
    });

    it('should have correct DAY value (86400 seconds / 24 hours)', () => {
      expect(CACHE.DAY).toBe(86400);
    });
  });

  describe('json()', () => {
    it('should return Response with correct content-type', () => {
      const response = json(mockContext.c, { foo: 'bar' });
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should serialize data to JSON', async () => {
      const response = json(mockContext.c, { foo: 'bar', num: 42 });
      const body = await response.json();
      expect(body).toEqual({ foo: 'bar', num: 42 });
    });

    it('should default to 200 status', () => {
      const response = json(mockContext.c, {});
      expect(response.status).toBe(200);
    });

    it('should accept custom status code', () => {
      const response = json(mockContext.c, {}, { status: 201 });
      expect(response.status).toBe(201);
    });

    it('should accept 404 status', () => {
      const response = json(mockContext.c, { error: 'not found' }, { status: 404 });
      expect(response.status).toBe(404);
    });

    it('should set no-store cache header when cache is 0', () => {
      const response = json(mockContext.c, {}, { cache: CACHE.NONE });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('should set public cache header with SHORT duration', () => {
      const response = json(mockContext.c, {}, { cache: CACHE.SHORT });
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
    });

    it('should set public cache header with MEDIUM duration', () => {
      const response = json(mockContext.c, {}, { cache: CACHE.MEDIUM });
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
    });

    it('should set public cache header with LONG duration', () => {
      const response = json(mockContext.c, {}, { cache: CACHE.LONG });
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=3600');
    });

    it('should set public cache header with DAY duration', () => {
      const response = json(mockContext.c, {}, { cache: CACHE.DAY });
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400');
    });

    it('should include CORS Allow-Origin header', () => {
      const response = json(mockContext.c, {});
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should include CORS Allow-Methods header', () => {
      const response = json(mockContext.c, {});
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should include CORS Allow-Headers header', () => {
      const response = json(mockContext.c, {});
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });

    it('should merge custom headers', () => {
      const response = json(mockContext.c, {}, { headers: { 'X-Custom': 'value' } });
      expect(response.headers.get('X-Custom')).toBe('value');
    });

    it('should allow custom headers to override defaults', () => {
      const response = json(mockContext.c, {}, {
        headers: { 'Cache-Control': 'private' },
      });
      expect(response.headers.get('Cache-Control')).toBe('private');
    });

    it('should handle empty object data', async () => {
      const response = json(mockContext.c, {});
      const body = await response.json();
      expect(body).toEqual({});
    });

    it('should handle array data', async () => {
      const response = json(mockContext.c, [1, 2, 3]);
      const body = await response.json();
      expect(body).toEqual([1, 2, 3]);
    });

    it('should handle null data', async () => {
      const response = json(mockContext.c, null);
      const body = await response.json();
      expect(body).toBeNull();
    });

    it('should handle nested object data', async () => {
      const data = { nested: { deep: { value: 'test' } } };
      const response = json(mockContext.c, data);
      const body = await response.json();
      expect(body).toEqual(data);
    });
  });

  describe('ics()', () => {
    it('should return Response with calendar content-type', () => {
      const response = ics(mockContext.c, 'BEGIN:VCALENDAR\nEND:VCALENDAR');
      expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    });

    it('should set content-disposition with default filename', () => {
      const response = ics(mockContext.c, 'content');
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="calendar.ics"');
    });

    it('should accept custom filename', () => {
      const response = ics(mockContext.c, 'content', 'my-calendar.ics');
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="my-calendar.ics"');
    });

    it('should set MEDIUM cache duration (300 seconds)', () => {
      const response = ics(mockContext.c, 'content');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    });

    it('should include CORS headers', () => {
      const response = ics(mockContext.c, 'content');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should include body content', async () => {
      const icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR';
      const response = ics(mockContext.c, icsContent);
      const body = await response.text();
      expect(body).toBe(icsContent);
    });

    it('should handle empty content', async () => {
      const response = ics(mockContext.c, '');
      const body = await response.text();
      expect(body).toBe('');
    });

    it('should have 200 status by default', () => {
      const response = ics(mockContext.c, 'content');
      expect(response.status).toBe(200);
    });
  });

  describe('error()', () => {
    it('should return JSON error response with correct structure', async () => {
      const response = error(mockContext.c, 'Something went wrong');
      const body = await response.json();
      expect(body).toEqual({ error: 'Something went wrong', success: false });
    });

    it('should default to 500 status', () => {
      const response = error(mockContext.c, 'Error');
      expect(response.status).toBe(500);
    });

    it('should accept 400 status code', () => {
      const response = error(mockContext.c, 'Bad request', 400);
      expect(response.status).toBe(400);
    });

    it('should accept 401 status code', () => {
      const response = error(mockContext.c, 'Unauthorized', 401);
      expect(response.status).toBe(401);
    });

    it('should accept 404 status code', () => {
      const response = error(mockContext.c, 'Not found', 404);
      expect(response.status).toBe(404);
    });

    it('should accept 502 status code', () => {
      const response = error(mockContext.c, 'Bad gateway', 502);
      expect(response.status).toBe(502);
    });

    it('should set no-store cache header', () => {
      const response = error(mockContext.c, 'Error');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('should include CORS headers', () => {
      const response = error(mockContext.c, 'Error');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should have JSON content-type', () => {
      const response = error(mockContext.c, 'Error');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should handle empty error message', async () => {
      const response = error(mockContext.c, '');
      const body = await response.json();
      expect(body.error).toBe('');
    });
  });

  describe('success()', () => {
    it('should return JSON success response with correct structure', async () => {
      const response = success(mockContext.c, { items: [] });
      const body = await response.json();
      expect(body).toEqual({ success: true, data: { items: [] } });
    });

    it('should include data in response', async () => {
      const data = { id: 1, name: 'Test' };
      const response = success(mockContext.c, data);
      const body = await response.json();
      expect(body.data).toEqual(data);
    });

    it('should include optional message', async () => {
      const response = success(mockContext.c, {}, 'Operation completed');
      const body = await response.json();
      expect(body.message).toBe('Operation completed');
    });

    it('should not include message field when not provided', async () => {
      const response = success(mockContext.c, {});
      const body = await response.json();
      expect(body).not.toHaveProperty('message');
    });

    it('should have 200 status by default', () => {
      const response = success(mockContext.c, {});
      expect(response.status).toBe(200);
    });

    it('should handle null data', async () => {
      const response = success(mockContext.c, null);
      const body = await response.json();
      expect(body.data).toBeNull();
    });

    it('should handle array data', async () => {
      const response = success(mockContext.c, [1, 2, 3]);
      const body = await response.json();
      expect(body.data).toEqual([1, 2, 3]);
    });

    it('should handle string data', async () => {
      const response = success(mockContext.c, 'result');
      const body = await response.json();
      expect(body.data).toBe('result');
    });
  });
});
