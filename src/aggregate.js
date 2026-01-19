/**
 * Aggregation service for combining summaries from all sources
 */

import * as db from './db.js';

/**
 * Generate aggregated summary using Workers AI
 */
async function generateAggregatedSummary(ai, sourceSummaries) {
	if (!sourceSummaries || sourceSummaries.length === 0) {
		return 'No source summaries available to aggregate.';
	}
	
	// Combine all source summaries
	const combinedSummaries = sourceSummaries
		.map((summary, index) => {
			const sourceName = summary.source || 'Unknown';
			const dateRange = new Date(summary.date_range_start * 1000).toLocaleDateString() + 
				' to ' + 
				new Date(summary.date_range_end * 1000).toLocaleDateString();
			
			return `Source: ${sourceName} (${summary.feedback_count} items, ${dateRange})\n${summary.summary}`;
		})
		.join('\n\n---\n\n');
	
	// Create prompt for aggregation
	const prompt = `You are a product manager analyzing feedback summaries from multiple sources. 
Create a comprehensive aggregated summary that:
1. Identifies common themes across all sources
2. Highlights the most critical issues or pain points
3. Notes positive feedback and what users love
4. Prioritizes feature requests and suggestions by frequency/importance
5. Provides overall sentiment analysis
6. Suggests actionable insights for the product team

Source Summaries:
${combinedSummaries}

Provide a well-structured, executive-level summary that synthesizes insights from all sources.`;

	try {
		const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: 'You are a product management assistant that synthesizes feedback from multiple sources into actionable insights.'
				},
				{
					role: 'user',
					content: prompt
				}
			],
			max_tokens: 1500,
			temperature: 0.7
		});
		
		// Extract the summary from the response
		if (response.response) {
			return response.response;
		}
		if (typeof response === 'string') {
			return response;
		}
		return JSON.stringify(response);
	} catch (error) {
		console.error('Error generating aggregated summary:', error);
		// Fallback to a simple aggregation if AI fails
		return `Aggregated summary of ${sourceSummaries.length} sources covering ${sourceSummaries.reduce((sum, s) => sum + s.feedback_count, 0)} total feedback items. Error generating AI summary: ${error.message}`;
	}
}

/**
 * Aggregate summaries from all sources for a given time period
 */
export async function aggregateSummaries(env, days = 7) {
	const ai = env.AI;
	
	// Calculate date range
	const now = Math.floor(Date.now() / 1000);
	const startTime = now - (days * 24 * 60 * 60);
	
	try {
		// Get all source summaries for the time period
		const sourceSummaries = await db.getSourceSummaries(env.DB, startTime, now);
		
		if (sourceSummaries.length === 0) {
			return {
				success: true,
				message: 'No source summaries found for the specified time period',
				summary: null
			};
		}
		
		// Generate aggregated summary
		const aggregatedSummary = await generateAggregatedSummary(ai, sourceSummaries);
		
		// Calculate totals
		const totalFeedbackCount = sourceSummaries.reduce((sum, s) => sum + s.feedback_count, 0);
		const uniqueSources = new Set(sourceSummaries.map(s => s.source));
		const sourceCount = uniqueSources.size;
		
		// Store aggregated summary
		await db.insertAggregatedSummary(
			env.DB,
			aggregatedSummary,
			startTime,
			now,
			sourceCount,
			totalFeedbackCount
		);
		
		return {
			success: true,
			message: 'Aggregated summary generated successfully',
			summary: aggregatedSummary,
			sourceCount,
			totalFeedbackCount,
			dateRange: {
				start: startTime,
				end: now
			}
		};
	} catch (error) {
		console.error('Error aggregating summaries:', error);
		return {
			success: false,
			message: `Error: ${error.message}`
		};
	}
}

/**
 * Get aggregation statistics
 */
export async function getAggregationStats(env) {
	try {
		const feedbackCounts = await db.getFeedbackCountsBySource(env.DB);
		const latestAggregated = await db.getLatestAggregatedSummaries(env.DB, 1);
		const latestSourceSummaries = await db.getLatestSourceSummaries(env.DB, 10);
		
		return {
			success: true,
			feedbackCountsBySource: feedbackCounts,
			latestAggregatedSummary: latestAggregated[0] || null,
			recentSourceSummaries: latestSourceSummaries
		};
	} catch (error) {
		console.error('Error getting aggregation stats:', error);
		return {
			success: false,
			message: `Error: ${error.message}`
		};
	}
}
