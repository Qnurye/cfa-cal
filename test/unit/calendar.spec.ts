// Unit tests for src/calendar.ts
// Note: generateIcs tests are skipped due to ics library compatibility issues with Workers runtime

import { describe, it, expect, vi } from 'vitest';
import { sampleEvents, incompleteEvents, locationStrings, icsPaths } from '../setup/fixtures';
import type { CalendarEvent } from '../../src/models';

// Mock the ics module to avoid compatibility issues
vi.mock('ics', () => ({
  createEvents: vi.fn((events) => {
    if (!events || events.length === 0) {
      return { value: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR', error: null };
    }
    const eventStrings = events.map((e: any) => `BEGIN:VEVENT\nSUMMARY:${e.title}\nUID:${e.uid}\nSTATUS:${e.status}\nDURATION:PT${Math.floor((e.duration?.minutes || 120) / 60)}H${(e.duration?.minutes || 120) % 60}M\nLOCATION:${e.location}\nORGANIZER:${e.organizer?.name}\nGEO:${e.geo?.lat};${e.geo?.lon}\nURL:${e.url}\nEND:VEVENT`).join('\n');
    return {
      value: `BEGIN:VCALENDAR\nVERSION:2.0\n${eventStrings}\nEND:VCALENDAR`,
      error: null,
    };
  }),
}));

// Import after mocking
import {
  parseLocation,
  buildCalendarTitle,
  filterEventsByLocation,
  generateIcs,
  parseIcsPath,
} from '../../src/calendar';

describe('Calendar Utilities', () => {
  describe('parseLocation()', () => {
    describe('Beijing Xiaoxitian', () => {
      it('should parse Hall 1', () => {
        const result = parseLocation(locationStrings.beijingXiaoxitian1);
        expect(result.cityCode).toBe('beijing');
        expect(result.cinemaCode).toBe('xiaoxitian');
        expect(result.hallCode).toBe('1');
        expect(result.displayLocation).toContain('小西天');
      });

      it('should parse Hall 2', () => {
        const result = parseLocation(locationStrings.beijingXiaoxitian2);
        expect(result.cityCode).toBe('beijing');
        expect(result.cinemaCode).toBe('xiaoxitian');
        expect(result.hallCode).toBe('2');
      });

      it('should have correct geo coordinates', () => {
        const result = parseLocation(locationStrings.beijingXiaoxitian1);
        expect(result.geo.lat).toBeCloseTo(39.952908, 4);
        expect(result.geo.lon).toBeCloseTo(116.369569, 4);
      });
    });

    describe('Beijing Baiziwan', () => {
      it('should parse Hall 1 with space before 号', () => {
        const result = parseLocation(locationStrings.beijingBaiziwan1);
        expect(result.cityCode).toBe('beijing');
        expect(result.cinemaCode).toBe('baiziwan');
        expect(result.hallCode).toBe('1');
      });

      it('should have correct geo coordinates', () => {
        const result = parseLocation(locationStrings.beijingBaiziwan1);
        expect(result.geo.lat).toBeCloseTo(39.896749, 4);
        expect(result.geo.lon).toBeCloseTo(116.511986, 4);
      });
    });

    describe('Suzhou Jiangnan', () => {
      it('should parse Hall 1', () => {
        const result = parseLocation(locationStrings.suzhouJiangnan1);
        expect(result.cityCode).toBe('suzhou');
        expect(result.cinemaCode).toBe('jiangnan');
        expect(result.hallCode).toBe('1');
      });

      it('should parse Hall 2', () => {
        const result = parseLocation(locationStrings.suzhouJiangnan2);
        expect(result.cityCode).toBe('suzhou');
        expect(result.cinemaCode).toBe('jiangnan');
        expect(result.hallCode).toBe('2');
      });

      it('should parse Hall 3', () => {
        const result = parseLocation(locationStrings.suzhouJiangnan3);
        expect(result.cityCode).toBe('suzhou');
        expect(result.cinemaCode).toBe('jiangnan');
        expect(result.hallCode).toBe('3');
      });
    });

    describe('Unknown locations', () => {
      it('should return empty codes for unrecognized location', () => {
        const result = parseLocation(locationStrings.unknown);
        expect(result.cityCode).toBe('');
        expect(result.cinemaCode).toBe('');
        expect(result.hallCode).toBe('');
      });

      it('should use original string as displayLocation', () => {
        const result = parseLocation(locationStrings.unknown);
        expect(result.displayLocation).toBe(locationStrings.unknown);
      });

      it('should have zero geo coordinates', () => {
        const result = parseLocation(locationStrings.unknown);
        expect(result.geo).toEqual({ lat: 0, lon: 0 });
      });

      it('should handle empty string', () => {
        const result = parseLocation('');
        expect(result.cityCode).toBe('');
        expect(result.displayLocation).toBe('');
      });
    });
  });

  describe('buildCalendarTitle()', () => {
    it('should return full title with all codes (Beijing Xiaoxitian Hall 1)', () => {
      const title = buildCalendarTitle('beijing', 'xiaoxitian', '1');
      // All halls use "X 号厅" format with space
      expect(title).toBe('北京市 小西天 1 号厅');
    });

    it('should return city + cinema title (Beijing Xiaoxitian)', () => {
      const title = buildCalendarTitle('beijing', 'xiaoxitian', '');
      expect(title).toBe('北京市 小西天');
    });

    it('should return city only title (Beijing)', () => {
      const title = buildCalendarTitle('beijing', '', '');
      expect(title).toBe('北京市');
    });

    it('should return default title for empty codes', () => {
      const title = buildCalendarTitle('', '', '');
      expect(title).toBe('CFA Calendar');
    });

    it('should handle Suzhou codes', () => {
      const title = buildCalendarTitle('suzhou', 'jiangnan', '2');
      // Jiangnan halls have "2 号厅" with space before 号厅
      expect(title).toBe('苏州市 江南分馆 2 号厅');
    });

    it('should handle unknown city code', () => {
      const title = buildCalendarTitle('unknown_city', '', '');
      expect(title).toBe('unknown_city');
    });

    it('should handle unknown cinema code', () => {
      const title = buildCalendarTitle('beijing', 'unknown_cinema', '');
      expect(title).toBe('北京市 unknown_cinema');
    });

    it('should handle unknown hall code', () => {
      const title = buildCalendarTitle('beijing', 'xiaoxitian', 'unknown');
      expect(title).toBe('北京市 小西天 unknown');
    });

    it('should handle all unknown codes', () => {
      const title = buildCalendarTitle('a', 'b', 'c');
      expect(title).toBe('a b c');
    });
  });

  describe('filterEventsByLocation()', () => {
    it('should return all events when no filters', () => {
      const result = filterEventsByLocation(sampleEvents, '', '', '');
      expect(result).toHaveLength(sampleEvents.length);
    });

    it('should filter by city code (Beijing)', () => {
      const result = filterEventsByLocation(sampleEvents, 'beijing', '', '');
      expect(result).toHaveLength(3); // Xiaoxitian 1, Xiaoxitian 2, Baiziwan
      expect(result.every(e => e.screen_cinema.includes('小西天') || e.screen_cinema.includes('百子湾'))).toBe(true);
    });

    it('should filter by city code (Suzhou)', () => {
      const result = filterEventsByLocation(sampleEvents, 'suzhou', '', '');
      expect(result).toHaveLength(1);
      expect(result[0].screen_cinema).toContain('江南');
    });

    it('should filter by city and cinema code', () => {
      const result = filterEventsByLocation(sampleEvents, 'beijing', 'xiaoxitian', '');
      expect(result).toHaveLength(2);
      expect(result.every(e => e.screen_cinema.includes('小西天'))).toBe(true);
    });

    it('should filter by all location codes', () => {
      const result = filterEventsByLocation(sampleEvents, 'beijing', 'xiaoxitian', '1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(12345);
    });

    it('should return empty array when no matches for city', () => {
      const result = filterEventsByLocation(sampleEvents, 'shanghai', '', '');
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no matches for cinema', () => {
      const result = filterEventsByLocation(sampleEvents, 'beijing', 'nonexistent', '');
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no matches for hall', () => {
      const result = filterEventsByLocation(sampleEvents, 'beijing', 'xiaoxitian', '99');
      expect(result).toHaveLength(0);
    });

    it('should handle empty events array', () => {
      const result = filterEventsByLocation([], 'beijing', '', '');
      expect(result).toHaveLength(0);
    });

    it('should handle single event array', () => {
      const result = filterEventsByLocation([sampleEvents[0]], 'beijing', 'xiaoxitian', '1');
      expect(result).toHaveLength(1);
    });
  });

  describe('parseIcsPath()', () => {
    it('should parse root calendar path', () => {
      const result = parseIcsPath(icsPaths.root);
      expect(result).toEqual({ cityCode: '', cinemaCode: '', hallCode: '' });
    });

    it('should parse city-level path (Beijing)', () => {
      const result = parseIcsPath(icsPaths.beijingCity);
      expect(result).toEqual({ cityCode: 'beijing', cinemaCode: '', hallCode: '' });
    });

    it('should parse city+cinema path (Beijing Xiaoxitian)', () => {
      const result = parseIcsPath(icsPaths.beijingXiaoxitian);
      expect(result).toEqual({ cityCode: 'beijing', cinemaCode: 'xiaoxitian', hallCode: '' });
    });

    it('should parse full path with hall (Beijing Xiaoxitian Hall 1)', () => {
      const result = parseIcsPath(icsPaths.beijingXiaoxitianHall1);
      expect(result).toEqual({ cityCode: 'beijing', cinemaCode: 'xiaoxitian', hallCode: '1' });
    });

    it('should parse Suzhou city path', () => {
      const result = parseIcsPath(icsPaths.suzhouCity);
      expect(result).toEqual({ cityCode: 'suzhou', cinemaCode: '', hallCode: '' });
    });

    it('should parse Suzhou Jiangnan path', () => {
      const result = parseIcsPath(icsPaths.suzhouJiangnan);
      expect(result).toEqual({ cityCode: 'suzhou', cinemaCode: 'jiangnan', hallCode: '' });
    });

    it('should parse Suzhou Jiangnan Hall 3 path', () => {
      const result = parseIcsPath(icsPaths.suzhouJiangnanHall3);
      expect(result).toEqual({ cityCode: 'suzhou', cinemaCode: 'jiangnan', hallCode: '3' });
    });

    it('should handle paths without leading slash', () => {
      const result = parseIcsPath('beijing/calendar.ics');
      expect(result).toEqual({ cityCode: 'beijing', cinemaCode: '', hallCode: '' });
    });

    it('should handle just calendar.ics', () => {
      const result = parseIcsPath('calendar.ics');
      expect(result).toEqual({ cityCode: '', cinemaCode: '', hallCode: '' });
    });
  });

  describe('generateIcs()', () => {
    it('should generate valid ICS structure for single event', () => {
      const events = [sampleEvents[0]];
      const result = generateIcs(events, 'Test Calendar');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('BEGIN:VCALENDAR');
        expect(result.content).toContain('END:VCALENDAR');
      }
    });

    it('should include movie name in ICS', () => {
      const events = [sampleEvents[0]];
      const result = generateIcs(events, 'Test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('霸王别姬');
      }
    });

    it('should include unique UID for each event', () => {
      const events = [sampleEvents[0]];
      const result = generateIcs(events, 'Test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('12345@cfa-cal');
      }
    });

    it('should skip events without start time', () => {
      const events = [incompleteEvents.noStartTime, sampleEvents[0]];
      const result = generateIcs(events, 'Test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).not.toContain('No Start Time Movie');
        expect(result.content).toContain('霸王别姬');
      }
    });

    it('should skip events with invalid start time', () => {
      const events = [incompleteEvents.invalidStartTime, sampleEvents[0]];
      const result = generateIcs(events, 'Test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).not.toContain('Invalid Start Time Movie');
        expect(result.content).toContain('霸王别姬');
      }
    });

    it('should handle empty events array', () => {
      const result = generateIcs([], 'Empty Calendar');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('BEGIN:VCALENDAR');
        expect(result.content).toContain('END:VCALENDAR');
      }
    });

    it('should include location from screen_cinema', () => {
      const events = [sampleEvents[0]];
      const result = generateIcs(events, 'Test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('LOCATION');
        expect(result.content).toContain('小西天');
      }
    });

    it('should set status as TENTATIVE', () => {
      const events = [sampleEvents[0]];
      const result = generateIcs(events, 'Test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('STATUS:TENTATIVE');
      }
    });

    it('should include geo coordinates', () => {
      const events = [sampleEvents[0]];
      const result = generateIcs(events, 'Test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('GEO');
      }
    });
  });
});
