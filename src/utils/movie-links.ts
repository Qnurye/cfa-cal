// Movie link generation utilities
// Creates links to IMDB, Douban, and Letterboxd for movie events

export interface MovieLinks {
  imdb: string;
  douban: string;
  letterboxd: string;
}

/**
 * Generate links to movie platforms
 * Uses direct links when IMDB ID is available, otherwise falls back to search links
 */
export function generateMovieLinks(
  showName: string,
  filmYear: string | null,
  imdbId: string | null
): MovieLinks {
  const encodedName = encodeURIComponent(showName);
  const searchQuery = filmYear ? `${showName} ${filmYear}` : showName;
  const encodedSearchQuery = encodeURIComponent(searchQuery);

  return {
    // Direct link if we have IMDB ID, otherwise search link
    imdb: imdbId
      ? `https://www.imdb.com/title/${imdbId}/`
      : `https://www.imdb.com/find/?q=${encodedName}`,

    // Douban doesn't have a public API for ID lookup, always use search
    douban: `https://search.douban.com/movie/subject_search?search_text=${encodedName}`,

    // Letterboxd uses title + year for better search results
    letterboxd: `https://letterboxd.com/search/${encodedSearchQuery}/`,
  };
}

/**
 * Format movie links for ICS description
 */
export function formatMovieLinksForDescription(links: MovieLinks): string {
  return [
    `IMDB: ${links.imdb}`,
    `豆瓣: ${links.douban}`,
    `Letterboxd: ${links.letterboxd}`,
  ].join('\n');
}
