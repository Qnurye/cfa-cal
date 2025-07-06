// models.ts
// Data structures for the calendar fetching application

// KV Storage schemas
export interface KVStorage {
  // Store access tokens
  access_token?: string;
  token_expires_at?: number; // Unix timestamp in milliseconds

  // Store last fetch time
  last_fetch_time?: number; // Unix timestamp in milliseconds
}

// D1 Database schemas

// Table: calendar_events
// Stores movie screening events from the calendar API
export interface CalendarEvent {
  id: number;            // screen_id from API
  show_name: string;     // movie title
  film_area: string;     // country/region of origin
  film_type: string;     // movie genre
  film_year: string;     // release year
  screen_time_len: number; // runtime in minutes
  show_mode: string;     // e.g. "OFF"
  show_type: string;     // e.g. "NOFE"
  program_ids: string;   // associated program IDs
  activity_ids: string;  // activity IDs if any
  statu_verify: string;  // verification status
  show_time: number;     // not sure of purpose, from API
  show_price: string;    // ticket price
  screen_up_time: string;       // listing publication time
  screen_sales_time: string;    // ticket sales start time
  screen_start_time: string;    // actual screening time
  program_colle: string;        // e.g. "SINGLE"
  screen_cinema: string;        // venue and theater
  activity: string;             // activities associated with screening
  have_activity: string;        // "true" or "false"
  tags: string[];               // any tags
  cover_img1: string;           // poster/cover image URL

  // Additional fields for our database
  date: string;                 // YYYY-MM-DD format
  day: number;                  // Day of month
  month: number;                // Month (1-12)
  year: number;                 // Year (e.g. 2025)
  created_at: string;           // ISO timestamp when record was created
  updated_at: string;           // ISO timestamp when record was last updated
}

// Table: calendar_days
// Stores calendar day information with event counts
export interface CalendarDay {
  day: number;                  // Day of month
  month: number;                // Month (1-12)
  year: number;                 // Year (e.g. 2025)
  date: string;                 // YYYY-MM-DD format
  have_activity: string;        // "true" or "false"
  events_count: number;         // Number of events on this day
  created_at: string;           // ISO timestamp when record was created
  updated_at: string;           // ISO timestamp when record was last updated
}

// API Response Types

// Login Response
export interface LoginResponse {
  status: number;
  msg: string;
  data?: {
    token: string;
    expires_time: number;
  };
  code: string;
}

// Calendar API Response
export interface CalendarResponse {
  status: number;
  msg: string;
  data?: {
    list: CalendarDayData[];
    count: number;
    data_type: string;
  };
}

export interface CalendarDayData {
  day: number;
  screen: CalendarEventData[];
  have_activity: string;
}

export interface CalendarEventData {
  id: number;
  show_name: string;
  film_area: string;
  film_type: string;
  film_year: string;
  screen_time_len: number;
  show_mode: string;
  show_type: string;
  program_ids: string;
  activity_ids: string;
  statu_verify: string;
  show_time: number;
  show_price: string;
  screen_up_time: string;
  screen_sales_time: string;
  screen_start_time: string;
  program_colle: string;
  screen_cinema: string;
  activity: string;
  have_activity: string;
  tags: string[];
  cover_img1: string;
}
