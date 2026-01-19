# Feedback Aggregation Tool

Cloudflare assignment for the Product Manager Intern - Summer 2026 position. 

A Cloudflare Workers-based tool that aggregates and analyzes product feedback from multiple sources (GitHub, Discord, Twitter, Email, Support Tickets, Forums) using AI-powered summarization.

## Features

- **Multi-source webhook support**: Receive feedback from GitHub, Discord, Twitter, Email, Support Tickets, and Forums
- **AI-powered summarization**: Uses Cloudflare Workers AI to generate intelligent summaries
- **Two-tier summarization**: 
  1. Per-source summaries for each feedback channel
  2. Aggregated summaries combining insights from all sources
- **Scheduled processing**: Automatic daily aggregation via Cron Triggers
- **Dashboard UI**: Beautiful web dashboard to view summaries and insights
- **REST API**: Programmatic access to summaries and statistics

## Architecture

- **Cloudflare Workers**: Serverless compute for API and processing
- **Cloudflare Workflows**: Durable multi-step execution for feedback processing pipeline
- **Workers AI**: AI summarization using Llama models
- **D1 Database**: SQLite database for storing feedback and summaries
- **Cron Triggers**: Scheduled batch processing
- **Static Assets**: Dashboard hosting

### Workflow Steps

The application uses two main workflows:

1. **FeedbackProcessingWorkflow**: Processes incoming feedback
   - Step 1: Store feedback in D1
   - Step 2: Fetch feedback records
   - Step 3: Generate summary using Workers AI
   - Step 4: Store summary in D1
   - Step 5: Mark feedback as processed

2. **AggregationWorkflow**: Aggregates summaries from all sources
   - Step 1: Fetch source summaries for time period
   - Step 2: Generate aggregated summary using Workers AI
   - Step 3: Store aggregated summary in D1

Workflows provide automatic retries, durable execution, and better observability compared to `ctx.waitUntil()`.

## Setup Instructions

### 1. Create D1 Database

```bash
wrangler d1 create feedback-db
```

This will output a database ID. Update `wrangler.jsonc` with your database ID:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "feedback-db",
    "database_id": "YOUR_DATABASE_ID_HERE"
  }
]
```

### 2. Initialize Database Schema

```bash
npx wrangler d1 execute feedback-db --file=schema.sql
```

### 3. Deploy Worker

```bash
npx wrangler deploy
```

## Usage

### Webhook Endpoints

Send feedback to your worker via webhooks:

- **GitHub**: `POST /webhook/github`
- **Discord**: `POST /webhook/discord`
- **Twitter**: `POST /webhook/twitter`
- **Email**: `POST /webhook/email`
- **Support**: `POST /webhook/support`
- **Forum**: `POST /webhook/forum`

### API Endpoints

- `GET /api/summaries` - Get all source summaries
- `GET /api/summaries/:source` - Get summaries for a specific source
- `GET /api/aggregated` - Get aggregated summaries
- `GET /api/stats` - Get statistics
- `POST /api/aggregate` - Manually trigger aggregation (body: `{ "days": 7 }`)
- `POST /api/summarize/:source` - Manually trigger summarization for a source

## Webhook Payload Formats

### GitHub

```json
{
  "issue": {
    "number": 123,
    "title": "Feature request",
    "body": "I would like...",
    "user": { "login": "username" },
    "labels": [{"name": "enhancement"}]
  },
  "action": "opened"
}
```

### Discord

```json
{
  "content": "Message content",
  "author": { "username": "user", "id": "123" },
  "channel_id": "456",
  "guild_id": "789"
}
```

### Generic Format

For other sources, send a JSON payload with:
- `content` or `text` or `body` - The feedback content
- `subject` or `title` - Optional subject/title
- `author` or `from` - Author information
- Any other metadata fields

## Development

```bash
# Start local development server
npx wrangler dev

# Deploy to production
npx wrangler deploy
```

## Configuration

Edit `wrangler.jsonc` to configure:
- Cron schedule (default: daily at midnight UTC)
- Database bindings
- Static assets directory

## Notes

- The cron trigger runs daily at midnight UTC (configurable in `wrangler.jsonc`)
- Summarization happens automatically via **FeedbackProcessingWorkflow** when feedback is received via webhooks
- Aggregation combines summaries from the last 7 days by default via **AggregationWorkflow**
- Workers AI uses the `@cf/meta/llama-3.1-8b-instruct` model
- Workflows provide automatic retries and durable execution (available on Free plan)
- Each workflow step is durable and will automatically retry on failure
