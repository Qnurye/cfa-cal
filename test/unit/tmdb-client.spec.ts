// Unit tests for src/tmdb-client.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockFetch } from '../setup/mocks';
import {
  searchMovie,
  getExternalIds,
  findMovieWithImdbId,
  TMDbRateLimitError,
} from '../../src/tmdb-client';

describe('TMDb Client', () => {
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mockFetch = createMockFetch();
    vi.stubGlobal('fetch', mockFetch.mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.reset();
  });

  describe('searchMovie()', () => {
    it('should send GET request to TMDb search endpoint', async () => {
      mockFetch.setResponse(/api.themoviedb.org/, new Response(JSON.stringify({
        results: [{ id: 603, title: 'The Matrix', original_title: 'The Matrix', release_date: '1999-03-30' }],
        total_results: 1,
      })));

      await searchMovie('test-api-key', 'The Matrix', '1999');

      const calls = mockFetch.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('api.themoviedb.org/3/search/movie');
      expect(calls[0].url).toContain('api_key=test-api-key');
      // URLSearchParams encodes spaces as + instead of %20
      expect(calls[0].url).toContain('query=The+Matrix');
      expect(calls[0].url).toContain('year=1999');
    });

    it('should not include year param when not provided', async () => {
      mockFetch.setResponse(/api.themoviedb.org/, new Response(JSON.stringify({
        results: [],
        total_results: 0,
      })));

      await searchMovie('test-api-key', 'The Matrix');

      const calls = mockFetch.getCalls();
      expect(calls[0].url).not.toContain('year=');
    });

    it('should return first search result on success', async () => {
      mockFetch.setResponse(/search\/movie/, new Response(JSON.stringify({
        results: [
          { id: 603, title: 'The Matrix', original_title: 'The Matrix', release_date: '1999-03-30' },
          { id: 604, title: 'The Matrix Reloaded', original_title: 'The Matrix Reloaded', release_date: '2003-05-07' },
        ],
        total_results: 2,
      })));

      const result = await searchMovie('key', 'The Matrix');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(603);
      expect(result?.title).toBe('The Matrix');
    });

    it('should return null when no results found', async () => {
      mockFetch.setResponse(/search\/movie/, new Response(JSON.stringify({
        results: [],
        total_results: 0,
      })));

      const result = await searchMovie('key', 'Nonexistent Movie Title 12345');

      expect(result).toBeNull();
    });

    it('should throw TMDbRateLimitError on 429 response', async () => {
      mockFetch.setResponse(/search\/movie/, new Response('Rate limit exceeded', { status: 429 }));

      await expect(searchMovie('key', 'Test')).rejects.toThrow(TMDbRateLimitError);
    });

    it('should return null on other HTTP errors', async () => {
      mockFetch.setResponse(/search\/movie/, new Response('Server error', { status: 500 }));

      const result = await searchMovie('key', 'Test');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.setResponse(/search\/movie/, () => {
        throw new Error('Network error');
      });

      const result = await searchMovie('key', 'Test');

      expect(result).toBeNull();
    });

    it('should set language to zh-CN', async () => {
      mockFetch.setResponse(/search\/movie/, new Response(JSON.stringify({
        results: [],
        total_results: 0,
      })));

      await searchMovie('key', 'Test');

      const calls = mockFetch.getCalls();
      expect(calls[0].url).toContain('language=zh-CN');
    });
  });

  describe('getExternalIds()', () => {
    it('should send GET request to external_ids endpoint', async () => {
      mockFetch.setResponse(/external_ids/, new Response(JSON.stringify({
        imdb_id: 'tt0133093',
        facebook_id: null,
        instagram_id: null,
        twitter_id: null,
      })));

      await getExternalIds('test-key', 603);

      const calls = mockFetch.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('api.themoviedb.org/3/movie/603/external_ids');
      expect(calls[0].url).toContain('api_key=test-key');
    });

    it('should return external IDs on success', async () => {
      mockFetch.setResponse(/external_ids/, new Response(JSON.stringify({
        imdb_id: 'tt0133093',
        facebook_id: 'TheMatrixMovie',
        instagram_id: null,
        twitter_id: null,
      })));

      const result = await getExternalIds('key', 603);

      expect(result).not.toBeNull();
      expect(result?.imdb_id).toBe('tt0133093');
      expect(result?.facebook_id).toBe('TheMatrixMovie');
    });

    it('should throw TMDbRateLimitError on 429 response', async () => {
      mockFetch.setResponse(/external_ids/, new Response('Rate limit exceeded', { status: 429 }));

      await expect(getExternalIds('key', 603)).rejects.toThrow(TMDbRateLimitError);
    });

    it('should return null on other HTTP errors', async () => {
      mockFetch.setResponse(/external_ids/, new Response('Not found', { status: 404 }));

      const result = await getExternalIds('key', 99999999);

      expect(result).toBeNull();
    });
  });

  describe('findMovieWithImdbId()', () => {
    it('should return tmdb_id and imdb_id when movie is found', async () => {
      mockFetch.setResponse(/search\/movie/, new Response(JSON.stringify({
        results: [{ id: 603, title: 'The Matrix', original_title: 'The Matrix', release_date: '1999-03-30' }],
        total_results: 1,
      })));
      mockFetch.setResponse(/external_ids/, new Response(JSON.stringify({
        imdb_id: 'tt0133093',
        facebook_id: null,
        instagram_id: null,
        twitter_id: null,
      })));

      const result = await findMovieWithImdbId('key', 'The Matrix', '1999');

      expect(result).not.toBeNull();
      expect(result?.tmdb_id).toBe(603);
      expect(result?.imdb_id).toBe('tt0133093');
    });

    it('should return null when movie is not found in search', async () => {
      mockFetch.setResponse(/search\/movie/, new Response(JSON.stringify({
        results: [],
        total_results: 0,
      })));

      const result = await findMovieWithImdbId('key', 'Nonexistent Movie');

      expect(result).toBeNull();
    });

    it('should return tmdb_id with null imdb_id when external_ids fails', async () => {
      mockFetch.setResponse(/search\/movie/, new Response(JSON.stringify({
        results: [{ id: 603, title: 'The Matrix', original_title: 'The Matrix', release_date: '1999-03-30' }],
        total_results: 1,
      })));
      mockFetch.setResponse(/external_ids/, new Response('Server error', { status: 500 }));

      const result = await findMovieWithImdbId('key', 'The Matrix');

      expect(result).not.toBeNull();
      expect(result?.tmdb_id).toBe(603);
      expect(result?.imdb_id).toBeNull();
    });

    it('should propagate TMDbRateLimitError from search', async () => {
      mockFetch.setResponse(/search\/movie/, new Response('Rate limited', { status: 429 }));

      await expect(findMovieWithImdbId('key', 'Test')).rejects.toThrow(TMDbRateLimitError);
    });

    it('should propagate TMDbRateLimitError from external_ids', async () => {
      mockFetch.setResponse(/search\/movie/, new Response(JSON.stringify({
        results: [{ id: 603, title: 'The Matrix', original_title: 'The Matrix', release_date: '1999-03-30' }],
        total_results: 1,
      })));
      mockFetch.setResponse(/external_ids/, new Response('Rate limited', { status: 429 }));

      await expect(findMovieWithImdbId('key', 'The Matrix')).rejects.toThrow(TMDbRateLimitError);
    });
  });
});
