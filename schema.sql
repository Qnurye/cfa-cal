-- Schema for CFA Calendar D1 Database

-- Table: calendar_events
-- Stores movie screening events from the calendar API
CREATE TABLE IF NOT EXISTS calendar_events
(
    id
    INTEGER
    PRIMARY
    KEY,     -- screen_id from API
    show_name
    TEXT
    NOT
    NULL,    -- movie title
    film_area
    TEXT,    -- country/region of origin
    film_type
    TEXT,    -- movie genre
    film_year
    TEXT,    -- release year
    screen_time_len
    INTEGER, -- runtime in minutes
    show_mode
    TEXT,    -- e.g. "OFF"
    show_type
    TEXT,    -- e.g. "NOFE"
    program_ids
    TEXT,    -- associated program IDs
    activity_ids
    TEXT,    -- activity IDs if any
    statu_verify
    TEXT,    -- verification status
    show_time
    INTEGER, -- not sure of purpose, from API
    show_price
    TEXT,    -- ticket price
    screen_up_time
    TEXT,    -- listing publication time
    screen_sales_time
    TEXT,    -- ticket sales start time
    screen_start_time
    TEXT
    NOT
    NULL,    -- actual screening time
    program_colle
    TEXT,    -- e.g. "SINGLE"
    screen_cinema
    TEXT,    -- venue and theater
    activity
    TEXT,    -- activities associated with screening
    have_activity
    TEXT,    -- "true" or "false"
    tags
    TEXT,    -- JSON array of tags
    cover_img1
    TEXT,    -- poster/cover image URL

    -- Additional fields for our database
    date
    TEXT
    NOT
    NULL,    -- YYYY-MM-DD format
    day
    INTEGER
    NOT
    NULL,    -- Day of month
    month
    INTEGER
    NOT
    NULL,    -- Month (1-12)
    year
    INTEGER
    NOT
    NULL,    -- Year (e.g. 2025)
    created_at
    TEXT
    NOT
    NULL,    -- ISO timestamp when record was created
    updated_at
    TEXT
    NOT
    NULL     -- ISO timestamp when record was last updated
);

-- Create indices for common queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_year_month ON calendar_events(year, month);
CREATE INDEX IF NOT EXISTS idx_calendar_events_screen_start_time ON calendar_events(screen_start_time);

-- Table: calendar_days
-- Stores calendar day information with event counts
CREATE TABLE IF NOT EXISTS calendar_days
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    day
    INTEGER
    NOT
    NULL,   -- Day of month
    month
    INTEGER
    NOT
    NULL,   -- Month (1-12)
    year
    INTEGER
    NOT
    NULL,   -- Year (e.g. 2025)
    date
    TEXT
    NOT
    NULL
    UNIQUE, -- YYYY-MM-DD format
    have_activity
    TEXT
    NOT
    NULL,   -- "true" or "false"
    events_count
    INTEGER
    NOT
    NULL,   -- Number of events on this day
    created_at
    TEXT
    NOT
    NULL,   -- ISO timestamp when record was created
    updated_at
    TEXT
    NOT
    NULL    -- ISO timestamp when record was last updated
);

-- Create indices for common queries
CREATE INDEX IF NOT EXISTS idx_calendar_days_date ON calendar_days(date);
CREATE INDEX IF NOT EXISTS idx_calendar_days_year_month ON calendar_days(year, month);

-- Table: fetch_logs
-- Stores logs of calendar data fetching attempts
CREATE TABLE IF NOT EXISTS fetch_logs
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    status
    TEXT
    NOT
    NULL,    -- "success" or "error"
    year
    INTEGER
    NOT
    NULL,    -- Year requested
    month
    INTEGER
    NOT
    NULL,    -- Month requested
    message
    TEXT,    -- Additional info or error message
    events_count
    INTEGER, -- Number of events fetched
    created_at
    TEXT
    NOT
    NULL     -- ISO timestamp of fetch attempt
);
