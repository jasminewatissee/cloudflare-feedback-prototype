/**
 * Summarization service using Cloudflare Workers AI
 */

import * as db from './db.js';

/**
 * Generate summary using Workers AI
 */
async function generateSummary(ai, feedbackItems) {
	if (!feedbackItems || feedbackItems.length === 0) {
		return 'No feedback to summarize.';
	}
	
	// Combine all feedback content
	const combinedContent = feedbackItems
		.map((item, index) => {
			const metadata = typeof item.metadata === 'string' 
				? JSON.parse(item.metadata) 
				: item.metadata;
			
			let text = `Feedback ${index + 1}:\n${item.content}`;
			if (metadata.author) {
				text += `\n[From: ${metadata.author}]`;
			}
			return text;
		})
		.join('\n\n---\n\n');
	
	// Create prompt for summarization
	const prompt = `You are a product feedback analyst. Analyze the following feedback items and create a concise summary that highlights:
1. Main themes and topics
2. Common pain points or issues
3. Positive feedback or praise
4. Suggestions or feature requests
5. Overall sentiment

Feedback items:
${combinedContent}

Provide a well-structured summary that would help a product manager understand the key insights from this feedback.`;

	try {
		const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: 'You are a helpful assistant that summarizes product feedback concisely and clearly.'
				},
				{
					role: 'user',
					content: prompt
				}
			],
			max_tokens: 1000,
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
		console.error('Error generating summary:', error);
		// Fallback to a simple summary if AI fails
		return `Summary of ${feedbackItems.length} feedback items. Error generating AI summary: ${error.message}`;
	}
}

/**
 * Process a batch of feedback items and generate summaries (synchronous, no queues)
 * This is called from webhook handlers using ctx.waitUntil() for background processing
 */
export async function processFeedbackBatch(env, source, feedbackData) {
	const ai = env.AI;
	
	if (!feedbackData || feedbackData.length === 0) {
		return;
	}
	
	try {
		// Fetch full feedback records from database (to get timestamps and ensure they exist)
		const feedbackIds = feedbackData.map(f => f.id);
		const placeholders = feedbackIds.map(() => '?').join(',');
		const feedbackRecords = await env.DB.prepare(
			`SELECT * FROM feedback WHERE id IN (${placeholders}) AND processed = 0`
		)
			.bind(...feedbackIds)
			.all();
		
		const feedbackItems = feedbackRecords.results || [];
		
		if (feedbackItems.length === 0) {
			console.log(`No unprocessed feedback found for ${source}`);
			return;
		}
		
		// Generate summary for this batch
		const summary = await generateSummary(ai, feedbackItems);
		
		// Calculate date range
		const timestamps = feedbackItems.map(f => f.created_at);
		const dateRangeStart = Math.min(...timestamps);
		const dateRangeEnd = Math.max(...timestamps);
		
		// Store summary in database
		await db.insertSourceSummary(
			env.DB,
			source,
			summary,
			dateRangeStart,
			dateRangeEnd,
			feedbackItems.length
		);
		
		// Mark feedback as processed
		await db.markFeedbackProcessed(env.DB, feedbackIds);
		
		console.log(`Generated summary for ${source} with ${feedbackItems.length} items`);
	} catch (error) {
		console.error(`Error processing feedback batch for ${source}:`, error);
		// Don't throw - we don't want to fail the webhook if summarization fails
	}
}

/**
 * Summarize feedback for a specific source (called from cron or manual trigger)
 */
export async function summarizeSourceFeedback(env, source, days = 1) {
	const ai = env.AI;
	
	const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
	
	// Get unprocessed feedback for this source
	const feedbackItems = await db.getUnprocessedFeedback(env.DB, source, 100);
	
	if (feedbackItems.length === 0) {
		return { success: true, message: `No unprocessed feedback for ${source}` };
	}
	
	// Filter by date if needed
	const recentFeedback = feedbackItems.filter(f => f.created_at >= cutoffTime);
	
	if (recentFeedback.length === 0) {
		return { success: true, message: `No recent feedback for ${source}` };
	}
	
	try {
		// Generate summary
		const summary = await generateSummary(ai, recentFeedback);
		
		// Calculate date range
		const timestamps = recentFeedback.map(f => f.created_at);
		const dateRangeStart = Math.min(...timestamps);
		const dateRangeEnd = Math.max(...timestamps);
		
		// Store summary
		await db.insertSourceSummary(
			env.DB,
			source,
			summary,
			dateRangeStart,
			dateRangeEnd,
			recentFeedback.length
		);
		
		// Mark as processed
		const feedbackIds = recentFeedback.map(f => f.id);
		await db.markFeedbackProcessed(env.DB, feedbackIds);
		
		return {
			success: true,
			message: `Generated summary for ${source}`,
			summary,
			feedbackCount: recentFeedback.length
		};
	} catch (error) {
		console.error(`Error summarizing ${source}:`, error);
		return {
			success: false,
			message: `Error: ${error.message}`
		};
	}
}
