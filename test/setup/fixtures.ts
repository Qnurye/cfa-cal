// Test fixtures for cfa-cal unit tests

import type { CalendarEvent, CalendarDay, CalendarResponse, LoginResponse } from '../../src/models';

// ============================================================================
// Login Response Fixtures
// ============================================================================

export const loginResponses = {
  success: {
    status: 200,
    code: '410001',
    msg: '登录成功',
    data: {
      token: 'mock-jwt-token-12345',
      expires_time: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
    },
  } as LoginResponse,

  invalidCredentials: {
    status: 200,
    code: '410025',
    msg: '账号或密码错误',
    data: undefined,
  } as LoginResponse,

  serverError: {
    status: 500,
    msg: 'Internal server error',
    code: '500000',
  } as LoginResponse,

  expiredToken: {
    status: 200,
    code: '410001',
    msg: '登录成功',
    data: {
      token: 'expired-token',
      expires_time: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    },
  } as LoginResponse,
};

// ============================================================================
// Calendar Response Fixtures
// ============================================================================

export const calendarResponses = {
  valid: {
    status: 200,
    msg: 'Success',
    data: {
      list: [
        {
          day: 15,
          have_activity: 'true',
          screen: [
            {
              id: 12345,
              show_name: '霸王别姬',
              film_area: '中国大陆/中国香港',
              film_type: '剧情/爱情/同性',
              film_year: '1993',
              screen_time_len: 171,
              show_mode: 'OFF',
              show_type: 'NOFE',
              program_ids: '123',
              activity_ids: '',
              statu_verify: 'PASS',
              show_time: 0,
              show_price: '40',
              screen_up_time: '2026-01-10 10:00:00',
              screen_sales_time: '2026-01-10 10:00:00',
              screen_start_time: '2026-01-15 19:00:00',
              program_colle: 'SINGLE',
              screen_cinema: '小西天艺术影院 1号厅',
              activity: '',
              have_activity: 'true',
              tags: [],
              cover_img1: 'https://example.com/poster.jpg',
            },
          ],
        },
        {
          day: 16,
          have_activity: 'true',
          screen: [
            {
              id: 12346,
              show_name: '活着',
              film_area: '中国大陆/中国香港',
              film_type: '剧情/家庭',
              film_year: '1994',
              screen_time_len: 132,
              show_mode: 'OFF',
              show_type: 'NOFE',
              program_ids: '124',
              activity_ids: '',
              statu_verify: 'PASS',
              show_time: 0,
              show_price: '40',
              screen_up_time: '2026-01-10 10:00:00',
              screen_sales_time: '2026-01-10 10:00:00',
              screen_start_time: '2026-01-16 14:00:00',
              program_colle: 'SINGLE',
              screen_cinema: '百子湾艺术影院 1 号厅',
              activity: '',
              have_activity: 'true',
              tags: [],
              cover_img1: 'https://example.com/poster2.jpg',
            },
          ],
        },
      ],
      count: 2,
      data_type: 'calendar',
    },
  } as CalendarResponse,

  empty: {
    status: 200,
    msg: 'Success',
    data: {
      list: [],
      count: 0,
      data_type: 'calendar',
    },
  } as CalendarResponse,

  unauthorized: {
    status: 401,
    msg: 'Unauthorized',
  } as CalendarResponse,

  forbidden: {
    status: 403,
    msg: 'Token expired',
  } as CalendarResponse,

  serverError: {
    status: 500,
    msg: 'Internal server error',
  } as CalendarResponse,

  invalidData: {
    status: 200,
    msg: 'Success',
    data: undefined,
  } as CalendarResponse,
};

// ============================================================================
// Calendar Event Fixtures
// ============================================================================

export const sampleEvents: CalendarEvent[] = [
  {
    id: 12345,
    show_name: '霸王别姬',
    film_area: '中国大陆/中国香港',
    film_type: '剧情/爱情/同性',
    film_year: '1993',
    screen_time_len: 171,
    show_mode: 'OFF',
    show_type: 'NOFE',
    program_ids: '123',
    activity_ids: '',
    statu_verify: 'PASS',
    show_time: 0,
    show_price: '40',
    screen_up_time: '2026-01-10 10:00:00',
    screen_sales_time: '2026-01-10 10:00:00',
    screen_start_time: '2026-01-15 19:00:00',
    program_colle: 'SINGLE',
    screen_cinema: '小西天艺术影院 1号厅',
    activity: '',
    have_activity: 'true',
    tags: [],
    cover_img1: 'https://example.com/poster.jpg',
    date: '2026-01-15',
    day: 15,
    month: 1,
    year: 2026,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    tmdb_id: 993846,
    imdb_id: 'tt0Mo6332',
    tmdb_lookup_status: 'found',
  },
  {
    id: 12346,
    show_name: '活着',
    film_area: '中国大陆/中国香港',
    film_type: '剧情/家庭',
    film_year: '1994',
    screen_time_len: 132,
    show_mode: 'OFF',
    show_type: 'NOFE',
    program_ids: '124',
    activity_ids: '',
    statu_verify: 'PASS',
    show_time: 0,
    show_price: '40',
    screen_up_time: '2026-01-10 10:00:00',
    screen_sales_time: '2026-01-10 10:00:00',
    screen_start_time: '2026-01-16 14:00:00',
    program_colle: 'SINGLE',
    screen_cinema: '百子湾艺术影院 1 号厅',
    activity: '映后交流',
    have_activity: 'true',
    tags: ['经典'],
    cover_img1: 'https://example.com/poster2.jpg',
    date: '2026-01-16',
    day: 16,
    month: 1,
    year: 2026,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    tmdb_id: null,
    imdb_id: null,
    tmdb_lookup_status: 'not_found',
  },
  {
    id: 12347,
    show_name: '大话西游',
    film_area: '中国香港',
    film_type: '喜剧/爱情/奇幻',
    film_year: '1995',
    screen_time_len: 95,
    show_mode: 'OFF',
    show_type: 'NOFE',
    program_ids: '125',
    activity_ids: '',
    statu_verify: 'PASS',
    show_time: 0,
    show_price: '40',
    screen_up_time: '2026-01-10 10:00:00',
    screen_sales_time: '2026-01-10 10:00:00',
    screen_start_time: '2026-01-17 19:30:00',
    program_colle: 'SINGLE',
    screen_cinema: '小西天艺术影院 2号厅',
    activity: '',
    have_activity: 'false',
    tags: [],
    cover_img1: 'https://example.com/poster3.jpg',
    date: '2026-01-17',
    day: 17,
    month: 1,
    year: 2026,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    tmdb_id: null,
    imdb_id: null,
    tmdb_lookup_status: 'pending',
  },
  {
    id: 12348,
    show_name: '苏州河',
    film_area: '中国大陆',
    film_type: '剧情/爱情',
    film_year: '2000',
    screen_time_len: 83,
    show_mode: 'OFF',
    show_type: 'NOFE',
    program_ids: '126',
    activity_ids: '',
    statu_verify: 'PASS',
    show_time: 0,
    show_price: '35',
    screen_up_time: '2026-01-10 10:00:00',
    screen_sales_time: '2026-01-10 10:00:00',
    screen_start_time: '2026-01-18 15:00:00',
    program_colle: 'SINGLE',
    screen_cinema: '江南分馆 1号厅',
    activity: '',
    have_activity: 'false',
    tags: [],
    cover_img1: 'https://example.com/poster4.jpg',
    date: '2026-01-18',
    day: 18,
    month: 1,
    year: 2026,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    tmdb_id: null,
    imdb_id: null,
    tmdb_lookup_status: 'pending',
  },
];

// ============================================================================
// Calendar Day Fixtures
// ============================================================================

export const sampleDays: CalendarDay[] = [
  {
    day: 15,
    month: 1,
    year: 2026,
    date: '2026-01-15',
    have_activity: 'true',
    events_count: 1,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
  {
    day: 16,
    month: 1,
    year: 2026,
    date: '2026-01-16',
    have_activity: 'true',
    events_count: 1,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
];

// ============================================================================
// Location String Fixtures
// ============================================================================

export const locationStrings = {
  beijingXiaoxitian1: '小西天艺术影院 1号厅',
  beijingXiaoxitian2: '小西天艺术影院 2号厅',
  beijingBaiziwan1: '百子湾艺术影院 1 号厅',
  suzhouJiangnan1: '江南分馆 1号厅',
  suzhouJiangnan2: '江南分馆 2号厅',
  suzhouJiangnan3: '江南分馆 3号厅',
  unknown: 'Unknown Theater Location',
};

// ============================================================================
// ICS Path Fixtures
// ============================================================================

export const icsPaths = {
  root: '/calendar.ics',
  beijingCity: '/beijing/calendar.ics',
  beijingXiaoxitian: '/beijing/xiaoxitian/calendar.ics',
  beijingXiaoxitianHall1: '/beijing/xiaoxitian/1/calendar.ics',
  suzhouCity: '/suzhou/calendar.ics',
  suzhouJiangnan: '/suzhou/jiangnan/calendar.ics',
  suzhouJiangnanHall3: '/suzhou/jiangnan/3/calendar.ics',
};

// ============================================================================
// Event Without Required Fields
// ============================================================================

export const incompleteEvents = {
  noStartTime: {
    id: 99999,
    show_name: 'No Start Time Movie',
    screen_cinema: '小西天艺术影院 1号厅',
    screen_start_time: '',
    screen_time_len: 120,
  } as unknown as CalendarEvent,

  invalidStartTime: {
    id: 99998,
    show_name: 'Invalid Start Time Movie',
    screen_cinema: '小西天艺术影院 1号厅',
    screen_start_time: 'not-a-valid-date',
    screen_time_len: 120,
  } as unknown as CalendarEvent,

  noDuration: {
    id: 99997,
    show_name: 'No Duration Movie',
    screen_cinema: '小西天艺术影院 1号厅',
    screen_start_time: '2026-01-20 19:00:00',
    screen_time_len: 0,
  } as unknown as CalendarEvent,
};
