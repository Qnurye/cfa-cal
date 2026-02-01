// Unit tests for src/utils/movie-links.ts

import { describe, it, expect } from 'vitest';
import { generateMovieLinks, formatMovieLinksForDescription } from '../../src/utils/movie-links';

describe('movie-links', () => {
  describe('generateMovieLinks()', () => {
    it('should generate direct IMDB link when imdb_id is provided', () => {
      const links = generateMovieLinks('The Matrix', '1999', 'tt0133093');

      expect(links.imdb).toBe('https://www.imdb.com/title/tt0133093/');
    });

    it('should generate search IMDB link when imdb_id is null', () => {
      const links = generateMovieLinks('The Matrix', '1999', null);

      expect(links.imdb).toBe('https://www.imdb.com/find/?q=The%20Matrix');
    });

    it('should always generate Douban search link', () => {
      const links = generateMovieLinks('霸王别姬', '1993', 'tt0106332');

      expect(links.douban).toBe(
        'https://search.douban.com/movie/subject_search?search_text=%E9%9C%B8%E7%8E%8B%E5%88%AB%E5%A7%AC'
      );
    });

    it('should include year in Letterboxd search when provided', () => {
      const links = generateMovieLinks('Inception', '2010', null);

      expect(links.letterboxd).toBe('https://letterboxd.com/search/Inception%202010/');
    });

    it('should not include year in Letterboxd search when null', () => {
      const links = generateMovieLinks('Inception', null, null);

      expect(links.letterboxd).toBe('https://letterboxd.com/search/Inception/');
    });

    it('should properly encode special characters in movie names', () => {
      const links = generateMovieLinks('Wall·E', '2008', null);

      expect(links.imdb).toContain('Wall%C2%B7E');
      expect(links.douban).toContain('Wall%C2%B7E');
    });

    it('should handle Chinese movie names', () => {
      const links = generateMovieLinks('花样年华', '2000', null);

      expect(links.imdb).toContain('%E8%8A%B1%E6%A0%B7%E5%B9%B4%E5%8D%8E');
      expect(links.letterboxd).toContain('%E8%8A%B1%E6%A0%B7%E5%B9%B4%E5%8D%8E');
    });

    it('should handle movie names with spaces', () => {
      const links = generateMovieLinks('The Dark Knight', '2008', null);

      expect(links.imdb).toBe('https://www.imdb.com/find/?q=The%20Dark%20Knight');
    });
  });

  describe('formatMovieLinksForDescription()', () => {
    it('should format links with correct labels', () => {
      const links = {
        imdb: 'https://www.imdb.com/title/tt0133093/',
        douban: 'https://search.douban.com/movie/subject_search?search_text=The%20Matrix',
        letterboxd: 'https://letterboxd.com/search/The%20Matrix%201999/',
      };

      const formatted = formatMovieLinksForDescription(links);

      expect(formatted).toBe(
        'IMDB: https://www.imdb.com/title/tt0133093/\n' +
        '豆瓣: https://search.douban.com/movie/subject_search?search_text=The%20Matrix\n' +
        'Letterboxd: https://letterboxd.com/search/The%20Matrix%201999/'
      );
    });

    it('should use newlines as separators', () => {
      const links = generateMovieLinks('Test Movie', '2020', 'tt1234567');
      const formatted = formatMovieLinksForDescription(links);

      const lines = formatted.split('\n');
      expect(lines).toHaveLength(3);
    });
  });
});
