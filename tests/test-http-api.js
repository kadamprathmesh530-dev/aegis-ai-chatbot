/**
 * Aegis AI - HTTP End-to-End API Integration & Security Boundary Tests
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'super_secret_jwt_key_e2e_testing';
process.env.ADMIN_EMAIL = 'admin@chatbot.local';
process.env.ADMIN_PASSWORD = 'Admin@123456';

const { initDatabase, userQueries, db } = require('../server/db/database');
const authRoutes = require('../server/routes/auth');
const conversationRoutes = require('../server/routes/conversations');
const chatRoutes = require('../server/routes/chat');
const adminRoutes = require('../server/routes/admin');

// Setup test Express server
const app = express();
app.use(cors());
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

let server;
let baseUrl;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runE2ETests() {
  console.log('==============================================');
  console.log('🚀 RUNNING HTTP API & AUTHORIZATION E2E TESTS');
  console.log('==============================================\n');

  // Start test server on random port
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 0;

  async function test(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     Error: ${err.message}\n`);
    }
  }

  let adminToken = null;
  let userTokenA = null;
  let userTokenB = null;
  let userAConversationId = null;

  const runId = Date.now();
  const userAEmail = `user_a_${runId}@e2e.test`;
  const userBEmail = `user_b_${runId}@e2e.test`;
  const userAName = `user_a_${runId}`;
  const userBName = `user_b_${runId}`;

  // 1. Admin Login
  await test('POST /api/auth/login logs in admin and returns token', async () => {
    const res = await request('POST', '/api/auth/login', {
      loginIdentifier: 'admin@chatbot.local',
      password: 'Admin@123456'
    });

    assert.strictEqual(res.status, 200, 'Admin login should return 200');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.user.role, 'admin');
    assert(res.body.token, 'Token should be returned');
    adminToken = res.body.token;
  });

  // 2. User A Registration & Login
  await test('POST /api/auth/register registers User A', async () => {
    const res = await request('POST', '/api/auth/register', {
      username: userAName,
      email: userAEmail,
      password: 'UserA_Password123'
    });

    assert.strictEqual(res.status, 201, 'User registration should return 201');
    assert.strictEqual(res.body.user.role, 'user');
    userTokenA = res.body.token;
  });

  // 3. User B Registration
  await test('POST /api/auth/register registers User B', async () => {
    const res = await request('POST', '/api/auth/register', {
      username: userBName,
      email: userBEmail,
      password: 'UserB_Password123'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.user.role, 'user');
    userTokenB = res.body.token;
  });

  // 4. Verification of GET /api/auth/me
  await test('GET /api/auth/me returns authenticated user details', async () => {
    const res = await request('GET', '/api/auth/me', null, userTokenA);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.username, userAName);
  });

  // 5. User A Creates Chat & Sends Message
  await test('POST /api/chat creates conversation and gets AI assistant response', async () => {
    const res = await request('POST', '/api/chat', {
      message: 'Hello, what is 2+2?'
    }, userTokenA);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.conversationId, 'Must return conversationId');
    assert.strictEqual(res.body.userMessage.content, 'Hello, what is 2+2?');
    assert(res.body.assistantMessage.content.length > 0, 'Assistant must generate response');
    userAConversationId = res.body.conversationId;
  });

  // 6. User Data Isolation Test: User B attempts to access User A's conversation
  await test('GET /api/conversations/:id blocks User B from accessing User A conversation', async () => {
    const res = await request('GET', `/api/conversations/${userAConversationId}`, null, userTokenB);
    assert.strictEqual(res.status, 404, 'User B must get 404/Access Denied when requesting User A conversation');
    assert.strictEqual(res.body.success, false);
  });

  // 7. Normal User Authorization Test: User A attempts to access Admin API
  await test('GET /api/admin/stats returns 403 Forbidden for non-admin user', async () => {
    const res = await request('GET', '/api/admin/stats', null, userTokenA);
    assert.strictEqual(res.status, 403, 'Normal user must be blocked with 403 from admin stats');
    assert.strictEqual(res.body.success, false);
  });

  // 8. Admin Authorization Test: Admin successfully accesses Admin API
  await test('GET /api/admin/stats returns stats for Admin', async () => {
    const res = await request('GET', '/api/admin/stats', null, adminToken);
    assert.strictEqual(res.status, 200, 'Admin must be able to view stats');
    assert.strictEqual(res.body.success, true);
    assert(res.body.stats.total_users >= 3);
  });

  // 9. Admin Inspects User A's Conversation
  await test('GET /api/admin/conversations/:id/messages allows Admin to inspect transcript', async () => {
    const res = await request('GET', `/api/admin/conversations/${userAConversationId}/messages`, null, adminToken);
    assert.strictEqual(res.status, 200, 'Admin must be able to inspect conversation');
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.owner.username, userAName);
    assert(res.body.messages.length >= 2, 'Transcript must include messages');
  });

  // Close server
  server.close();

  console.log('\n==============================================');
  console.log(`🏁 E2E RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('==============================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runE2ETests().catch(err => {
  if (server) server.close();
  console.error('E2E test failure:', err);
  process.exit(1);
});

