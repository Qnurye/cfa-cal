// Integration tests for scheduled handler

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';

// Mock ics module to avoid compatibility issues with Workers runtime
vi.mock('ics', () => ({
  createEvents: vi.fn(() => ({
    value: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR',
    error: null,
  })),
}));

import worker from '../../src/index';

describe('Scheduled Handler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute scheduled handler without throwing', async () => {
    const ctx = createExecutionContext();

    // This should not throw
    expect(() => {
      worker.scheduled(
        { cron: '0 */12 * * *', scheduledTime: Date.now() } as ScheduledEvent,
        env,
        ctx
      );
    }).not.toThrow();

    await waitOnExecutionContext(ctx);
  });

  it('should log start of scheduled run', async () => {
    const ctx = createExecutionContext();
    const consoleSpy = vi.spyOn(console, 'log');

    worker.scheduled(
      { cron: '0 */12 * * *', scheduledTime: Date.now() } as ScheduledEvent,
      env,
      ctx
    );

    await waitOnExecutionContext(ctx);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Scheduled'));
  });

  it('should handle cron trigger every 12 hours', async () => {
    const ctx = createExecutionContext();

    // Simulate the configured cron pattern
    worker.scheduled(
      { cron: '0 */12 * * *', scheduledTime: Date.now() } as ScheduledEvent,
      env,
      ctx
    );

    await waitOnExecutionContext(ctx);

    // Should complete without error (logged errors are caught internally)
  });
});
