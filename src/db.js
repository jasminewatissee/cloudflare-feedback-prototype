/**
 * Database utility functions for D1 operations
 */

/**
 * Insert a new feedback entry
 */
export async function insertFeedback(db, source, content, metadata = {}) {
	const result = await db.prepare(
		'INSERT INTO feedback (source, content, metadata, created_at) VALUES (?, ?, ?, ?)'
	)
		.bind(source, content, JSON.stringify(metadata), Math.floor(Date.now() / 1000))
		.run();
	
	return result.meta.last_row_id;
}

/**
 * Get unprocessed feedback for a source
 */
export async function getUnprocessedFeedback(db, source, limit = 50) {
	const result = await db.prepare(
		'SELECT * FROM feedback WHERE source = ? AND processed = 0 ORDER BY created_at ASC LIMIT ?'
	)
		.bind(source, limit)
		.all();
	
	return result.results || [];
}

/**
 * Mark feedback as processed
 */
export async function markFeedbackProcessed(db, feedbackIds) {
	if (!feedbackIds || feedbackIds.length === 0) return;
	
	const placeholders = feedbackIds.map(() => '?').join(',');
	const result = await db.prepare(
		`UPDATE feedback SET processed = 1 WHERE id IN (${placeholders})`
	)
		.bind(...feedbackIds)
		.run();
	
	return result.meta.changes;
}

/**
 * Insert a source summary
 */
export async function insertSourceSummary(db, source, summary, dateRangeStart, dateRangeEnd, feedbackCount) {
	const result = await db.prepare(
		'INSERT INTO source_summaries (source, summary, date_range_start, date_range_end, feedback_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	)
		.bind(
			source,
			summary,
			dateRangeStart,
			dateRangeEnd,
			feedbackCount,
			Math.floor(Date.now() / 1000)
		)
		.run();
	
	return result.meta.last_row_id;
}

/**
 * Get source summaries for a date range
 */
export async function getSourceSummaries(db, dateRangeStart, dateRangeEnd) {
	const result = await db.prepare(
		'SELECT * FROM source_summaries WHERE date_range_start >= ? AND date_range_end <= ? ORDER BY created_at DESC'
	)
		.bind(dateRangeStart, dateRangeEnd)
		.all();
	
	return result.results || [];
}

/**
 * Get latest source summaries
 */
export async function getLatestSourceSummaries(db, limit = 10) {
	const result = await db.prepare(
		'SELECT * FROM source_summaries ORDER BY created_at DESC LIMIT ?'
	)
		.bind(limit)
		.all();
	
	return result.results || [];
}

/**
 * Get source summaries by source
 */
export async function getSourceSummariesBySource(db, source, limit = 10) {
	const result = await db.prepare(
		'SELECT * FROM source_summaries WHERE source = ? ORDER BY created_at DESC LIMIT ?'
	)
		.bind(source, limit)
		.all();
	
	return result.results || [];
}

/**
 * Insert an aggregated summary
 */
export async function insertAggregatedSummary(db, summary, dateRangeStart, dateRangeEnd, sourceCount, totalFeedbackCount) {
	const result = await db.prepare(
		'INSERT INTO aggregated_summaries (summary, date_range_start, date_range_end, source_count, total_feedback_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	)
		.bind(
			summary,
			dateRangeStart,
			dateRangeEnd,
			sourceCount,
			totalFeedbackCount,
			Math.floor(Date.now() / 1000)
		)
		.run();
	
	return result.meta.last_row_id;
}

/**
 * Get latest aggregated summaries
 */
export async function getLatestAggregatedSummaries(db, limit = 10) {
	const result = await db.prepare(
		'SELECT * FROM aggregated_summaries ORDER BY created_at DESC LIMIT ?'
	)
		.bind(limit)
		.all();
	
	return result.results || [];
}

/**
 * Get feedback count by source
 */
export async function getFeedbackCountsBySource(db) {
	const result = await db.prepare(
		'SELECT source, COUNT(*) as count FROM feedback GROUP BY source'
	)
		.all();
	
	return result.results || [];
}
