-- Feedback Aggregation Tool Database Schema

-- Raw feedback entries from all sources
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL, -- 'github', 'discord', 'twitter', 'email', 'support', 'forum'
    content TEXT NOT NULL,
    metadata TEXT, -- JSON string with source-specific metadata
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    processed INTEGER DEFAULT 0 -- 0 = not processed, 1 = processed
);

-- Per-source summaries
CREATE TABLE IF NOT EXISTS source_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    summary TEXT NOT NULL,
    date_range_start INTEGER NOT NULL,
    date_range_end INTEGER NOT NULL,
    feedback_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Final aggregated summaries across all sources
CREATE TABLE IF NOT EXISTS aggregated_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary TEXT NOT NULL,
    date_range_start INTEGER NOT NULL,
    date_range_end INTEGER NOT NULL,
    source_count INTEGER NOT NULL,
    total_feedback_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_processed ON feedback(processed);
CREATE INDEX IF NOT EXISTS idx_source_summaries_source ON source_summaries(source);
CREATE INDEX IF NOT EXISTS idx_source_summaries_date ON source_summaries(date_range_start, date_range_end);
CREATE INDEX IF NOT EXISTS idx_aggregated_date ON aggregated_summaries(date_range_start, date_range_end);
