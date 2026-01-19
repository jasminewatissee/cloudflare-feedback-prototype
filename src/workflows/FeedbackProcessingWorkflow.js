/**
 * Feedback Processing Workflow
 * 
 * This workflow handles the complete feedback processing pipeline:
 * Step 1: Store feedback in D1
 * Step 2: Summarize feedback using Workers AI
 * Step 3: Mark feedback as processed
 */

import { WorkflowEntrypoint } from 'cloudflare:workers';

import * as db from '../db.js';

export class FeedbackProcessingWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		const { source, feedbackItems } = event.params;
		
		// Step 1: Store feedback items in D1
		const storedFeedback = await step.do('store-feedback', async () => {
			const feedbackIds = [];
			const storedItems = [];
			
			for (const item of feedbackItems) {
				const id = await db.insertFeedback(
					this.env.DB,
					source,
					item.content,
					item.metadata || {}
				);
				feedbackIds.push(id);
				storedItems.push({
					id,
					source,
					content: item.content,
					metadata: item.metadata
				});
			}
			
			return {
				feedbackIds,
				items: storedItems,
				count: storedItems.length
			};
		});
		
		if (storedFeedback.count === 0) {
			return {
				success: true,
				message: 'No feedback items to process',
				feedbackIds: []
			};
		}
		
		// Step 2: Fetch stored feedback records (to get timestamps)
		const feedbackRecords = await step.do('fetch-feedback-records', async () => {
			const feedbackIds = storedFeedback.feedbackIds;
			const placeholders = feedbackIds.map(() => '?').join(',');
			const result = await this.env.DB.prepare(
				`SELECT * FROM feedback WHERE id IN (${placeholders}) AND processed = 0`
			)
				.bind(...feedbackIds)
				.all();
			
			return result.results || [];
		});
		
		if (feedbackRecords.length === 0) {
			return {
				success: true,
				message: 'No unprocessed feedback found',
				feedbackIds: storedFeedback.feedbackIds
			};
		}
		
		// Step 3: Generate summary using Workers AI
		const summary = await step.do('generate-summary', async () => {
			const combinedContent = feedbackRecords
				.map((item, index) => {
					const metadata = typeof item.metadata === 'string' 
						? JSON.parse(item.metadata) 
						: item.metadata || {};
					
					let text = `Feedback ${index + 1}:\n${item.content}`;
					if (metadata.author) {
						text += `\n[From: ${metadata.author}]`;
					}
					return text;
				})
				.join('\n\n---\n\n');
			
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
				const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
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
				throw new Error(`Failed to generate summary: ${error.message}`);
			}
		});
		
		// Step 4: Calculate date range and store summary
		const summaryResult = await step.do('store-summary', async () => {
			const timestamps = feedbackRecords.map(f => f.created_at);
			const dateRangeStart = Math.min(...timestamps);
			const dateRangeEnd = Math.max(...timestamps);
			
			await db.insertSourceSummary(
				this.env.DB,
				source,
				summary,
				dateRangeStart,
				dateRangeEnd,
				feedbackRecords.length
			);
			
			return {
				dateRangeStart,
				dateRangeEnd,
				feedbackCount: feedbackRecords.length
			};
		});
		
		// Step 5: Mark feedback as processed
		await step.do('mark-processed', async () => {
			await db.markFeedbackProcessed(this.env.DB, storedFeedback.feedbackIds);
			return { processed: storedFeedback.feedbackIds.length };
		});
		
		return {
			success: true,
			message: `Processed ${storedFeedback.count} feedback items for ${source}`,
			feedbackIds: storedFeedback.feedbackIds,
			summaryId: summaryResult,
			summaryPreview: summary.substring(0, 200) + '...'
		};
	}
}
