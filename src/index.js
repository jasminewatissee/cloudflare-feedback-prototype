/**
 * Feedback Aggregation Tool - Main Worker
 * 
 * Routes:
 * - POST /webhook/:source - Receive webhook data
 * - GET /api/summaries - Get all summaries
 * - GET /api/summaries/:source - Get summaries for a source
 * - GET /api/aggregated - Get aggregated summaries
 * - GET /api/stats - Get statistics
 * - GET / - Serve dashboard
 */

import * as db from './db.js';
import { parseWebhook } from './webhooks.js';
import { getAggregationStats } from './aggregate.js';
import { FeedbackProcessingWorkflow } from './workflows/FeedbackProcessingWorkflow.js';
import { AggregationWorkflow } from './workflows/AggregationWorkflow.js';

// Export workflows for registration
export { FeedbackProcessingWorkflow } from './workflows/FeedbackProcessingWorkflow.js';
export { AggregationWorkflow } from './workflows/AggregationWorkflow.js';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname;
		
		// Handle static assets (dashboard)
		if (path === '/' || path.startsWith('/assets/')) {
			return handleStaticAssets(request, env);
		}
		
		// Handle webhook endpoints
		if (path.startsWith('/webhook/')) {
			return handleWebhook(request, env, ctx);
		}
		
		// Handle API endpoints
		if (path.startsWith('/api/')) {
			return handleAPI(request, env, url);
		}
		
		// Default 404
		return new Response('Not Found', { status: 404 });
	},
	
	// Cron trigger handler
	async scheduled(event, env, ctx) {
		ctx.waitUntil(handleCronTrigger(env));
	}
};

/**
 * Handle webhook requests
 */
async function handleWebhook(request, env, ctx) {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}
	
	const url = new URL(request.url);
	const source = url.pathname.split('/webhook/')[1];
	
	if (!source) {
		return new Response('Source required', { status: 400 });
	}
	
	try {
		const payload = await request.json();
		
		// Parse webhook based on source
		const feedbackItems = parseWebhook(source, payload);
		
		if (feedbackItems.length === 0) {
			return new Response(JSON.stringify({ message: 'No feedback items extracted' }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}
		
		// Trigger FeedbackProcessingWorkflow to handle storing and summarizing
		// The workflow will handle all steps: store → summarize → mark processed
		const workflowId = await env.FEEDBACK_WORKFLOW.run({
			params: {
				source,
				feedbackItems: feedbackItems.map(item => ({
					content: item.content,
					metadata: item.metadata
				}))
			}
		});
		
		return new Response(JSON.stringify({
			success: true,
			message: `Processing ${feedbackItems.length} feedback items via workflow`,
			workflowId: workflowId.id
		}), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Webhook error:', error);
		return new Response(JSON.stringify({
			success: false,
			error: error.message
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}

/**
 * Handle API endpoints
 */
async function handleAPI(request, env, url) {
	const path = url.pathname;
	
	try {
		// GET /api/summaries
		if (path === '/api/summaries' && request.method === 'GET') {
			const summaries = await db.getLatestSourceSummaries(env.DB, 50);
			return jsonResponse({ success: true, summaries });
		}
		
		// GET /api/summaries/:source
		if (path.startsWith('/api/summaries/') && request.method === 'GET') {
			const source = path.split('/api/summaries/')[1];
			const summaries = await db.getSourceSummariesBySource(env.DB, source, 20);
			return jsonResponse({ success: true, source, summaries });
		}
		
		// GET /api/aggregated
		if (path === '/api/aggregated' && request.method === 'GET') {
			const limit = parseInt(url.searchParams.get('limit') || '10');
			const summaries = await db.getLatestAggregatedSummaries(env.DB, limit);
			return jsonResponse({ success: true, summaries });
		}
		
		// GET /api/stats
		if (path === '/api/stats' && request.method === 'GET') {
			const stats = await getAggregationStats(env);
			return jsonResponse(stats);
		}
		
		// POST /api/aggregate (manual trigger - uses AggregationWorkflow)
		if (path === '/api/aggregate' && request.method === 'POST') {
			const body = await request.json().catch(() => ({}));
			const days = parseInt(body.days || '7');
			
			const workflowId = await env.AGGREGATION_WORKFLOW.run({
				params: { days }
			});
			
			return jsonResponse({
				success: true,
				message: 'Aggregation workflow started',
				workflowId: workflowId.id
			});
		}
		
		// POST /api/summarize/:source (manual trigger - uses FeedbackProcessingWorkflow)
		if (path.startsWith('/api/summarize/') && request.method === 'POST') {
			const source = path.split('/api/summarize/')[1];
			const body = await request.json().catch(() => ({}));
			const days = parseInt(body.days || '1');
			
			// Fetch unprocessed feedback for this source
			const cutoffTime = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
			const feedbackItems = await db.getUnprocessedFeedback(env.DB, source, 100);
			const recentFeedback = feedbackItems.filter(f => f.created_at >= cutoffTime);
			
			if (recentFeedback.length === 0) {
				return jsonResponse({
					success: true,
					message: `No unprocessed feedback for ${source}`
				});
			}
			
			const workflowId = await env.FEEDBACK_WORKFLOW.run({
				params: {
					source,
					feedbackItems: recentFeedback.map(item => ({
						content: item.content,
						metadata: typeof item.metadata === 'string' 
							? JSON.parse(item.metadata) 
							: item.metadata
					}))
				}
			});
			
			return jsonResponse({
				success: true,
				message: `Summarization workflow started for ${source}`,
				workflowId: workflowId.id,
				feedbackCount: recentFeedback.length
			});
		}
		
		return new Response('Not Found', { status: 404 });
	} catch (error) {
		console.error('API error:', error);
		return jsonResponse({
			success: false,
			error: error.message
		}, 500);
	}
}

/**
 * Handle static assets (dashboard)
 */
async function handleStaticAssets(request, env) {
	// Try to serve from ASSETS binding first
	if (env.ASSETS) {
		return env.ASSETS.fetch(request);
	}
	
	// Fallback: return a simple response directing to dashboard
	// In production, the dashboard will be served via ASSETS binding
	return new Response('Dashboard will be served here. Use ASSETS binding in production.', {
		headers: { 'Content-Type': 'text/plain' }
	});
}

/**
 * Handle cron trigger - triggers AggregationWorkflow
 */
async function handleCronTrigger(env) {
	try {
		console.log('Running scheduled aggregation workflow...');
		
		// Trigger aggregation workflow for the last 7 days
		const workflowId = await env.AGGREGATION_WORKFLOW.run({
			params: { days: 7 }
		});
		
		console.log('Aggregation workflow started:', workflowId.id);
	} catch (error) {
		console.error('Cron trigger error:', error);
	}
}

/**
 * Helper to create JSON responses
 */
function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
