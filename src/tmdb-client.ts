// TMDb API client for movie metadata enrichment
// Fetches TMDb IDs and IMDB IDs for movie events

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_TIMEOUT_MS = 5000;

interface TMDbSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
}

interface TMDbSearchResponse {
  results: TMDbSearchResult[];
  total_results: number;
}

interface TMDbExternalIds {
  imdb_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

export interface TMDbMovieInfo {
  tmdb_id: number;
  imdb_id: string | null;
}

/**
 * Search for a movie on TMDb by title and optional year
 */
export async function searchMovie(
  apiKey: string,
  title: string,
  year?: string | null
): Promise<TMDbSearchResult | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query: title,
    language: 'zh-CN',
  });

  if (year) {
    params.set('year', year);
  }

  const url = `${TMDB_BASE_URL}/search/movie?${params}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[TMDb] Rate limited');
        throw new TMDbRateLimitError('TMDb rate limit exceeded');
      }
      console.error(`[TMDb] Search failed: ${response.status}`);
      return null;
    }

    const data: TMDbSearchResponse = await response.json();

    if (data.results.length === 0) {
      return null;
    }

    // Return the first (most relevant) result
    return data.results[0];
  } catch (error) {
    if (error instanceof TMDbRateLimitError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[TMDb] Search timeout');
    } else {
      console.error('[TMDb] Search error:', error);
    }
    return null;
  }
}

/**
 * Get external IDs (IMDB, etc.) for a TMDb movie
 */
export async function getExternalIds(
  apiKey: string,
  tmdbId: number
): Promise<TMDbExternalIds | null> {
  const url = `${TMDB_BASE_URL}/movie/${tmdbId}/external_ids?api_key=${apiKey}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[TMDb] Rate limited');
        throw new TMDbRateLimitError('TMDb rate limit exceeded');
      }
      console.error(`[TMDb] External IDs failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TMDbRateLimitError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[TMDb] External IDs timeout');
    } else {
      console.error('[TMDb] External IDs error:', error);
    }
    return null;
  }
}

/**
 * Find a movie and get its TMDb ID and IMDB ID in one operation
 */
export async function findMovieWithImdbId(
  apiKey: string,
  title: string,
  year?: string | null
): Promise<TMDbMovieInfo | null> {
  const movie = await searchMovie(apiKey, title, year);

  if (!movie) {
    return null;
  }

  const externalIds = await getExternalIds(apiKey, movie.id);

  return {
    tmdb_id: movie.id,
    imdb_id: externalIds?.imdb_id || null,
  };
}

/**
 * Custom error for TMDb rate limiting
 */
export class TMDbRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TMDbRateLimitError';
  }
}
