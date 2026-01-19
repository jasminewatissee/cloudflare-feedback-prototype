#!/usr/bin/env node
/**
 * Test script to diagnose Wrangler dev mode issues
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_PATH = '/Users/jwatissee/Desktop/my-first-worker/.cursor/debug.log';
const SERVER_ENDPOINT = 'http://127.0.0.1:7242/ingest/8d2ef2d9-7136-4b3a-9ede-2a769972a9ab';

function log(hypothesisId, message, data = {}) {
	const logEntry = {
		sessionId: 'debug-session',
		runId: 'wrangler-test',
		hypothesisId,
		location: 'test-wrangler-dev.js',
		message,
		data,
		timestamp: Date.now()
	};
	
	const logLine = JSON.stringify(logEntry) + '\n';
	fs.appendFileSync(LOG_PATH, logLine);
	
	// Also send via HTTP
	fetch(SERVER_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(logEntry)
	}).catch(() => {});
}

async function testWranglerCommand(args, hypothesisId) {
	return new Promise((resolve) => {
		log(hypothesisId, `Starting wrangler with args: ${args.join(' ')}`, { args });
		
		const wrangler = spawn('npx', ['wrangler', ...args], {
			cwd: __dirname,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		
		let stdout = '';
		let stderr = '';
		let resolved = false;
		
		wrangler.stdout.on('data', (data) => {
			stdout += data.toString();
		});
		
		wrangler.stderr.on('data', (data) => {
			stderr += data.toString();
			log(hypothesisId, 'Wrangler stderr output', { chunk: data.toString().substring(0, 200) });
		});
		
		wrangler.on('error', (error) => {
			if (!resolved) {
				resolved = true;
				log(hypothesisId, 'Wrangler spawn error', { error: error.message, code: error.code });
				resolve({ success: false, error: error.message, stdout, stderr });
			}
		});
		
		wrangler.on('exit', (code, signal) => {
			if (!resolved) {
				resolved = true;
				log(hypothesisId, 'Wrangler exited', { code, signal, stdoutLength: stdout.length, stderrLength: stderr.length });
				
				if (code === 0) {
					resolve({ success: true, stdout, stderr });
				} else {
					resolve({ success: false, code, signal, stdout, stderr });
				}
			}
		});
		
		// Timeout after 10 seconds
		setTimeout(() => {
			if (!resolved) {
				resolved = true;
				wrangler.kill();
				log(hypothesisId, 'Wrangler test timeout', {});
				resolve({ success: false, error: 'Timeout', stdout, stderr });
			}
		}, 10000);
	});
}

async function main() {
	log('A', 'Starting wrangler dev mode tests', {});
	
	// Test 1: Try with --local flag (Hypothesis A - remote dev is the issue)
	log('A', 'Testing Hypothesis A: Using --local flag to avoid remote dev', {});
	const resultLocal = await testWranglerCommand(['dev', '--local'], 'A');
	log('A', 'Local mode test completed', { success: resultLocal.success, hasError: !!resultLocal.error });
	
	if (resultLocal.success) {
		console.log('SUCCESS: Local mode works!');
		console.log('Solution: Use "wrangler dev --local" or add --local to package.json scripts');
		process.exit(0);
	}
	
	// Test 2: Check wrangler version
	log('E', 'Testing Hypothesis E: Checking wrangler version', {});
	const versionResult = await testWranglerCommand(['--version'], 'E');
	log('E', 'Version check completed', { success: versionResult.success, version: versionResult.stdout });
	
	// Test 3: Try with --remote=false explicitly
	log('A', 'Testing explicit --remote=false flag', {});
	const resultRemoteFalse = await testWranglerCommand(['dev', '--remote=false'], 'A');
	log('A', 'Remote=false test completed', { success: resultRemoteFalse.success });
	
	console.log('\n=== Test Results ===');
	console.log('Local mode:', resultLocal.success ? 'SUCCESS' : 'FAILED');
	console.log('Remote=false:', resultRemoteFalse.success ? 'SUCCESS' : 'FAILED');
	console.log('\nError details:', resultLocal.stderr || resultLocal.error || 'None');
}

main().catch(console.error);
