/**
 * Webhook handlers for different feedback sources
 */

/**
 * Parse GitHub webhook payload
 */
export function parseGitHubWebhook(payload) {
	const items = [];
	
	// Handle GitHub Issues
	if (payload.issue) {
		items.push({
			content: `Issue #${payload.issue.number}: ${payload.issue.title}\n\n${payload.issue.body || ''}`,
			metadata: {
				issue_number: payload.issue.number,
				issue_url: payload.issue.html_url,
				author: payload.issue.user?.login,
				labels: payload.issue.labels?.map(l => l.name) || [],
				state: payload.issue.state,
				action: payload.action
			}
		});
	}
	
	// Handle GitHub Issue Comments
	if (payload.comment && payload.issue) {
		items.push({
			content: `Comment on Issue #${payload.issue.number}: ${payload.comment.body}`,
			metadata: {
				issue_number: payload.issue.number,
				issue_url: payload.issue.html_url,
				comment_id: payload.comment.id,
				author: payload.comment.user?.login,
				action: payload.action
			}
		});
	}
	
	// Handle GitHub Discussions
	if (payload.discussion) {
		items.push({
			content: `Discussion: ${payload.discussion.title}\n\n${payload.discussion.body || ''}`,
			metadata: {
				discussion_number: payload.discussion.number,
				discussion_url: payload.discussion.html_url,
				author: payload.discussion.user?.login,
				category: payload.discussion.category?.name,
				action: payload.action
			}
		});
	}
	
	return items;
}

/**
 * Parse Discord webhook payload
 */
export function parseDiscordWebhook(payload) {
	const items = [];
	
	// Handle Discord messages
	if (payload.content || payload.embeds) {
		let content = payload.content || '';
		
		// Add embed content if present
		if (payload.embeds && payload.embeds.length > 0) {
			const embedTexts = payload.embeds.map(embed => {
				let text = '';
				if (embed.title) text += `**${embed.title}**\n`;
				if (embed.description) text += `${embed.description}\n`;
				if (embed.fields) {
					text += embed.fields.map(f => `**${f.name}**: ${f.value}`).join('\n');
				}
				return text;
			}).join('\n\n');
			content += '\n\n' + embedTexts;
		}
		
		items.push({
			content: content.trim(),
			metadata: {
				channel_id: payload.channel_id,
				guild_id: payload.guild_id,
				author: payload.author?.username || payload.author?.name,
				author_id: payload.author?.id,
				message_id: payload.id,
				timestamp: payload.timestamp
			}
		});
	}
	
	return items;
}

/**
 * Parse Twitter/X webhook payload (generic format)
 */
export function parseTwitterWebhook(payload) {
	const items = [];
	
	// Handle tweet mentions
	if (payload.tweet) {
		items.push({
			content: payload.tweet.text || payload.tweet.full_text || '',
			metadata: {
				tweet_id: payload.tweet.id,
				author: payload.tweet.user?.screen_name,
				author_id: payload.tweet.user?.id,
				created_at: payload.tweet.created_at,
				url: `https://twitter.com/${payload.tweet.user?.screen_name}/status/${payload.tweet.id}`
			}
		});
	}
	
	// Handle direct mentions
	if (payload.text) {
		items.push({
			content: payload.text,
			metadata: {
				tweet_id: payload.id,
				author: payload.author,
				created_at: payload.created_at,
				url: payload.url
			}
		});
	}
	
	return items;
}

/**
 * Parse email webhook payload (generic format)
 */
export function parseEmailWebhook(payload) {
	const items = [];
	
	if (payload.subject || payload.body || payload.text) {
		items.push({
			content: `Subject: ${payload.subject || 'No Subject'}\n\n${payload.body || payload.text || payload.html || ''}`,
			metadata: {
				from: payload.from || payload.sender,
				to: payload.to || payload.recipient,
				subject: payload.subject,
				message_id: payload.message_id || payload.id,
				date: payload.date || payload.timestamp
			}
		});
	}
	
	return items;
}

/**
 * Parse support ticket webhook payload (generic format)
 */
export function parseSupportTicketWebhook(payload) {
	const items = [];
	
	if (payload.ticket) {
		const ticket = payload.ticket;
		items.push({
			content: `Ticket #${ticket.id || ticket.number}: ${ticket.subject || ticket.title}\n\n${ticket.description || ticket.body || ticket.content || ''}`,
			metadata: {
				ticket_id: ticket.id || ticket.number,
				status: ticket.status,
				priority: ticket.priority,
				requester: ticket.requester || ticket.customer,
				created_at: ticket.created_at || ticket.created,
				url: ticket.url
			}
		});
	} else if (payload.subject || payload.content) {
		items.push({
			content: `Subject: ${payload.subject || 'No Subject'}\n\n${payload.content || payload.body || payload.description || ''}`,
			metadata: {
				ticket_id: payload.id || payload.ticket_id,
				status: payload.status,
				priority: payload.priority,
				requester: payload.requester || payload.customer,
				created_at: payload.created_at || payload.created
			}
		});
	}
	
	return items;
}

/**
 * Parse forum webhook payload (generic format)
 */
export function parseForumWebhook(payload) {
	const items = [];
	
	// Handle forum posts
	if (payload.post) {
		const post = payload.post;
		items.push({
			content: `Post: ${post.title || 'No Title'}\n\n${post.content || post.body || post.text || ''}`,
			metadata: {
				post_id: post.id,
				author: post.author || post.user,
				forum: post.forum || payload.forum,
				category: post.category,
				created_at: post.created_at || post.created,
				url: post.url
			}
		});
	} else if (payload.title || payload.content) {
		items.push({
			content: `Post: ${payload.title || 'No Title'}\n\n${payload.content || payload.body || payload.text || ''}`,
			metadata: {
				post_id: payload.id,
				author: payload.author || payload.user,
				forum: payload.forum,
				category: payload.category,
				created_at: payload.created_at || payload.created,
				url: payload.url
			}
		});
	}
	
	return items;
}

/**
 * Main webhook parser router
 */
export function parseWebhook(source, payload) {
	const parsers = {
		github: parseGitHubWebhook,
		discord: parseDiscordWebhook,
		twitter: parseTwitterWebhook,
		email: parseEmailWebhook,
		support: parseSupportTicketWebhook,
		forum: parseForumWebhook
	};
	
	const parser = parsers[source.toLowerCase()];
	if (!parser) {
		// Generic fallback - try to extract any text content
		return [{
			content: typeof payload === 'string' ? payload : JSON.stringify(payload),
			metadata: { raw: true }
		}];
	}
	
	return parser(payload);
}
