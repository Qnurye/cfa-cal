// Mock utilities for Cloudflare Worker testing
// Provides mocks for D1Database, KVNamespace, and fetch

import { vi } from 'vitest';

// ============================================================================
// D1 Database Mock
// ============================================================================

interface MockD1Options {
  defaultResults?: unknown[];
}

interface ExecutedQuery {
  sql: string;
  bindings: unknown[];
}

export function createMockD1(options: MockD1Options = {}) {
  const executedQueries: ExecutedQuery[] = [];
  const queryResults = new Map<string, unknown>();
  const batchResults: unknown[] = [];

  const createStatement = (sql: string) => {
    let bindings: unknown[] = [];

    const statement = {
      bind: (...values: unknown[]) => {
        bindings = values;
        return statement;
      },
      first: async <T = unknown>(column?: string): Promise<T | null> => {
        executedQueries.push({ sql, bindings });
        const result = findResult(sql);
        if (column && result && typeof result === 'object') {
          return (result as Record<string, unknown>)[column] as T;
        }
        return result as T | null;
      },
      all: async <T = unknown>(): Promise<{ results: T[]; success: boolean }> => {
        executedQueries.push({ sql, bindings });
        const result = findResult(sql);
        if (Array.isArray(result)) {
          return { results: result as T[], success: true };
        }
        if (result && typeof result === 'object' && 'results' in result) {
          return result as { results: T[]; success: boolean };
        }
        return { results: (options.defaultResults || []) as T[], success: true };
      },
      run: async () => {
        executedQueries.push({ sql, bindings });
        return { success: true, meta: {} };
      },
      raw: async <T = unknown>(): Promise<T[]> => {
        executedQueries.push({ sql, bindings });
        return [] as T[];
      },
    };

    return statement;
  };

  const findResult = (sql: string): unknown => {
    // Check for exact match first
    if (queryResults.has(sql)) {
      const result = queryResults.get(sql);
      if (typeof result === 'function') {
        return result();
      }
      return result;
    }

    // Check for pattern match
    for (const [pattern, result] of queryResults.entries()) {
      if (sql.includes(pattern)) {
        if (typeof result === 'function') {
          return result();
        }
        return result;
      }
    }

    return null;
  };

  const db = {
    prepare: (sql: string) => createStatement(sql),
    batch: async <T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> => {
      const results: D1Result<T>[] = [];
      for (const stmt of statements) {
        // Execute each statement
        await (stmt as any).run();
        results.push({
          results: [] as T[],
          success: true,
          meta: { duration: 0, changes: 0, last_row_id: 0, changed_db: false, size_after: 0, rows_read: 0, rows_written: 0 },
        } as D1Result<T>);
      }
      return batchResults.length > 0 ? batchResults as D1Result<T>[] : results;
    },
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;

  return {
    db,
    setQueryResult: (sqlPattern: string, result: unknown) => {
      queryResults.set(sqlPattern, result);
    },
    setBatchResults: (results: unknown[]) => {
      batchResults.length = 0;
      batchResults.push(...results);
    },
    getExecutedQueries: () => [...executedQueries],
    reset: () => {
      executedQueries.length = 0;
      queryResults.clear();
      batchResults.length = 0;
    },
  };
}

// ============================================================================
// KV Namespace Mock
// ============================================================================

export function createMockKV() {
  const storage = new Map<string, string>();

  const kv = {
    get: async (key: string, options?: { type?: string } | string) => {
      const value = storage.get(key);
      if (value === undefined) return null;

      const type = typeof options === 'string' ? options : options?.type;
      if (type === 'json') {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      return value;
    },
    put: async (key: string, value: string | object) => {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      storage.set(key, strValue);
    },
    delete: async (key: string) => {
      storage.delete(key);
    },
    list: async () => {
      return {
        keys: Array.from(storage.keys()).map((name) => ({ name })),
        list_complete: true,
        cursor: '',
      };
    },
    getWithMetadata: async (key: string) => {
      return { value: storage.get(key) || null, metadata: null };
    },
  } as unknown as KVNamespace;

  return {
    kv,
    setData: (key: string, value: unknown) => {
      storage.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    getData: (key: string) => {
      const value = storage.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    reset: () => {
      storage.clear();
    },
  };
}

// ============================================================================
// Fetch Mock
// ============================================================================

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export function createMockFetch() {
  const responses = new Map<string | RegExp, Response | Response[] | (() => Response)>();
  const calls: FetchCall[] = [];
  const callCounts = new Map<string, number>();

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const headers: Record<string, string> = {};

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    let body: unknown = null;
    if (init?.body) {
      try {
        body = JSON.parse(init.body as string);
      } catch {
        body = init.body;
      }
    }

    calls.push({ url, method, headers, body });

    // Find matching response
    for (const [pattern, response] of responses.entries()) {
      const matches = typeof pattern === 'string'
        ? url.includes(pattern)
        : pattern.test(url);

      if (matches) {
        const patternKey = pattern.toString();
        const count = callCounts.get(patternKey) || 0;
        callCounts.set(patternKey, count + 1);

        if (typeof response === 'function') {
          return response();
        }
        if (Array.isArray(response)) {
          const idx = Math.min(count, response.length - 1);
          return response[idx].clone();
        }
        return response.clone();
      }
    }

    // Default 404 response
    return new Response('Not found', { status: 404 });
  };

  return {
    mockFetch: mockFetch as typeof fetch,
    setResponse: (pattern: string | RegExp, response: Response | Response[] | (() => Response)) => {
      responses.set(pattern, response);
    },
    getCalls: () => [...calls],
    getCallCount: (pattern: string | RegExp) => {
      let count = 0;
      for (const call of calls) {
        const matches = typeof pattern === 'string'
          ? call.url.includes(pattern)
          : pattern.test(call.url);
        if (matches) count++;
      }
      return count;
    },
    reset: () => {
      responses.clear();
      calls.length = 0;
      callCounts.clear();
    },
  };
}

// ============================================================================
// Hono Context Mock
// ============================================================================

export function createMockContext(env?: Partial<{
  CFA_CAL_KV: KVNamespace;
  DB: D1Database;
  API_ACCOUNT: string;
  API_PASSWORD: string;
}>) {
  const mockKV = createMockKV();
  const mockD1 = createMockD1();

  const fullEnv = {
    CFA_CAL_KV: env?.CFA_CAL_KV || mockKV.kv,
    DB: env?.DB || mockD1.db,
    API_ACCOUNT: env?.API_ACCOUNT || 'test_account',
    API_PASSWORD: env?.API_PASSWORD || 'test_password',
  };

  const c = {
    env: fullEnv,
    req: {
      url: 'https://example.com/',
      method: 'GET',
      header: () => null,
      query: () => null,
    },
    json: (data: unknown, status?: number) => {
      return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    text: (data: string, status?: number) => {
      return new Response(data, {
        status: status || 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    },
  };

  return { c: c as any, env: fullEnv, mockKV, mockD1 };
}

// ============================================================================
// Test Environment Setup
// ============================================================================

export function createTestEnv() {
  const mockKV = createMockKV();
  const mockD1 = createMockD1();
  const mockFetch = createMockFetch();

  const env = {
    CFA_CAL_KV: mockKV.kv,
    DB: mockD1.db,
    API_ACCOUNT: 'test_account',
    API_PASSWORD: 'test_password',
  };

  return {
    env,
    mockKV,
    mockD1,
    mockFetch,
    stubFetch: () => {
      vi.stubGlobal('fetch', mockFetch.mockFetch);
    },
    reset: () => {
      mockKV.reset();
      mockD1.reset();
      mockFetch.reset();
      vi.unstubAllGlobals();
    },
  };
}
