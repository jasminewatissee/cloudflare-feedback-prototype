/**
 * Aggregation Workflow
 * 
 * This workflow aggregates summaries from all sources:
 * Step 1: Fetch source summaries for the time period
 * Step 2: Generate aggregated summary using Workers AI
 * Step 3: Store aggregated summary in D1
 */

import { WorkflowEntrypoint } from 'cloudflare:workers';

import * as db from '../db.js';

export class AggregationWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		const { days = 7 } = event.params;
		
		// Step 1: Calculate date range and fetch source summaries
		const sourceSummaries = await step.do('fetch-source-summaries', async () => {
			const now = Math.floor(Date.now() / 1000);
			const startTime = now - (days * 24 * 60 * 60);
			
			const summaries = await db.getSourceSummaries(this.env.DB, startTime, now);
			
			return {
				summaries,
				dateRange: { start: startTime, end: now }
			};
		});
		
		if (sourceSummaries.summaries.length === 0) {
			return {
				success: true,
				message: 'No source summaries found for the specified time period',
				summary: null,
				dateRange: sourceSummaries.dateRange
			};
		}
		
		// Step 2: Generate aggregated summary using Workers AI
		const aggregatedSummary = await step.do('generate-aggregated-summary', async () => {
			const combinedSummaries = sourceSummaries.summaries
				.map((summary) => {
					const sourceName = summary.source || 'Unknown';
					const dateRange = new Date(summary.date_range_start * 1000).toLocaleDateString() + 
						' to ' + 
						new Date(summary.date_range_end * 1000).toLocaleDateString();
					
					return `Source: ${sourceName} (${summary.feedback_count} items, ${dateRange})\n${summary.summary}`;
				})
				.join('\n\n---\n\n');
			
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
				const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
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
				throw new Error(`Failed to generate aggregated summary: ${error.message}`);
			}
		});
		
		// Step 3: Calculate totals and store aggregated summary
		const result = await step.do('store-aggregated-summary', async () => {
			const totalFeedbackCount = sourceSummaries.summaries.reduce(
				(sum, s) => sum + s.feedback_count, 
				0
			);
			const uniqueSources = new Set(sourceSummaries.summaries.map(s => s.source));
			const sourceCount = uniqueSources.size;
			
			await db.insertAggregatedSummary(
				this.env.DB,
				aggregatedSummary,
				sourceSummaries.dateRange.start,
				sourceSummaries.dateRange.end,
				sourceCount,
				totalFeedbackCount
			);
			
			return {
				sourceCount,
				totalFeedbackCount,
				dateRange: sourceSummaries.dateRange
			};
		});
		
		return {
			success: true,
			message: 'Aggregated summary generated successfully',
			summary: aggregatedSummary,
			sourceCount: result.sourceCount,
			totalFeedbackCount: result.totalFeedbackCount,
			dateRange: result.dateRange
		};
	}
}
