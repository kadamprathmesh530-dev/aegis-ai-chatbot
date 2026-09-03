/**
 * Test script for streaming chat endpoint
 * Tests POST /api/chat/stream with SSE parsing
 */

'use strict';

require('dotenv').config();

const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function getAuthToken() {
  const runId = Date.now();
  const payload = JSON.stringify({
    username: 'streamtest_' + runId,
    email: 'streamtest_' + runId + '@test.local',
    password: 'StreamTest123!'
  });

  const res = await fetch(BASE_URL + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload
  });

  const data = await res.json();
  if (!data.success || !data.token) {
    throw new Error('Failed to obtain auth token: ' + JSON.stringify(data));
  }
  return data.token;
}

async function testStreaming() {
  console.log('==============================================');
  console.log('🧪 TESTING STREAMING ENDPOINT /api/chat/stream');
  console.log('==============================================\n');

  let token;
  try {
    token = await getAuthToken();
    console.log('✅ Obtained fresh auth token\n');
  } catch (err) {
    console.error('❌ Auth failed:', err.message);
    process.exit(1);
  }

  const postData = JSON.stringify({ message: 'Hello' });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat/stream',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Response status: ${res.statusCode}`);
    console.log(`Response headers:`, res.headers);
    console.log('');

    if (res.statusCode !== 200) {
      let errorData = '';
      res.on('data', chunk => errorData += chunk);
      res.on('end', () => {
        console.error('❌ Request failed:', errorData);
        process.exit(1);
      });
      return;
    }

    console.log('✅ Connected to SSE stream\n');
    console.log('--- SSE Events ---\n');

    let buffer = '';
    let eventCount = 0;

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      
      // Split by double newline to get complete SSE events
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // Keep incomplete event in buffer

      for (const event of events) {
        if (event.trim() === '') continue;
        
        eventCount++;
        console.log(`[Event ${eventCount}]`);
        console.log(event);
        console.log('');
      }
    });

    res.on('end', () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        eventCount++;
        console.log(`[Event ${eventCount} - Final]`);
        console.log(buffer);
        console.log('');
      }

      console.log('==============================================');
      console.log(`📊 Total SSE events received: ${eventCount}`);
      console.log('==============================================');

      if (eventCount === 0) {
        console.error('❌ No SSE events received — streaming may be broken.');
        process.exit(1);
      }

      console.log('\n✅ Streaming test passed.');
      process.exit(0);
    });
  });

  req.on('error', (error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

  req.write(postData);
  req.end();
}

testStreaming();
