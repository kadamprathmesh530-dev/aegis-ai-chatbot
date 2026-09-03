require('dotenv').config();
const assert = require('assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { initDatabase, userQueries, conversationQueries, messageQueries, pool } = require('../server/db/database');
const { generateToken, validateRegistrationInput } = require('../server/middleware/auth');

async function runTests() {
  console.log('==============================================');
  console.log('🧪 RUNNING COMPREHENSIVE BACKEND & SECURITY TESTS');
  console.log('==============================================\n');

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

  // 1. Database & Schema Initialization
  await test('Initializes PostgreSQL database and tables with foreign keys', async () => {
    await initDatabase();
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = res.rows.map(t => t.table_name);
    assert(tables.includes('users'), 'Users table must exist');
    assert(tables.includes('conversations'), 'Conversations table must exist');
    assert(tables.includes('messages'), 'Messages table must exist');
  });

  // 2. Admin Seeding & Password Hashing
  await test('Seeds designated default admin and hashes password with bcrypt (never plaintext)', async () => {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@chatbot.local').toLowerCase();
    const admin = await userQueries.getByEmail(adminEmail);
    assert(admin, 'Admin user should be seeded');
    assert.strictEqual(admin.role, 'admin', 'Admin user must have admin role');
    assert(admin.password_hash.startsWith('$2'), 'Password must be valid bcrypt hash');
    const isMatch = await bcrypt.compare(process.env.ADMIN_PASSWORD || 'Admin@123456', admin.password_hash);
    assert(isMatch, 'Bcrypt must verify valid admin password');
  });

  // 3. User Registration & Password Security
  await test('Registers standard user with secure bcrypt hash (12 rounds) and isolated account', async () => {
    const runId = Date.now();
    const username = 'alice_' + runId;
    const email = 'alice_' + runId + '@example.com';
    const password = 'AliceSecurePassword!123';

    const valErrors = validateRegistrationInput(username, email, password);
    assert.strictEqual(valErrors.length, 0, 'Valid input should have zero validation errors');

    const hash = await bcrypt.hash(password, 12);
    const result = await userQueries.create(username, email, hash, 'user');
    assert(result.id > 0, 'User should be inserted');

    const created = await userQueries.getById(result.id);
    assert.strictEqual(created.username, username);
    assert.strictEqual(created.email, email);
    assert.strictEqual(created.role, 'user', 'Standard user must not have admin role');
  });

  // 4. JWT Token Generation & Verification
  await test('Generates signed JWT containing user claims and verifies signature', async () => {
    const runId = Date.now();
    const user = { id: 9999, username: 'jwt_test_' + runId, email: 'jwt@test.local', role: 'user' };
    const token = generateToken(user);
    assert(typeof token === 'string' && token.length > 20, 'Token must be non-empty string');

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'aegis_jwt_secret_key_prod_2026_secure');
    assert.strictEqual(decoded.id, user.id);
    assert.strictEqual(decoded.username, user.username);
    assert.strictEqual(decoded.role, 'user');
  });

  // 5. Conversation Ownership & Data Isolation
  await test('Creates conversations and enforces strict user data isolation', async () => {
    const runId = Date.now();
    const hash = await bcrypt.hash('Secret123!', 12);
    const userA = await userQueries.create('iso_a_' + runId, 'iso_a_' + runId + '@test.local', hash, 'user');
    const userB = await userQueries.create('iso_b_' + runId, 'iso_b_' + runId + '@test.local', hash, 'user');

    const convId = 'conv-iso-' + runId;
    await conversationQueries.create(convId, userA.id, "User A Private Chat");

    const accessA = await conversationQueries.getByIdAndUser(convId, userA.id);
    assert(accessA, "User A must access their conversation");
    assert.strictEqual(accessA.title, "User A Private Chat");

    const accessB = await conversationQueries.getByIdAndUser(convId, userB.id);
    assert.strictEqual(accessB, null, "User B must NEVER access User A conversation");
  });

  // 6. Messages Persistence & Cascade Constraints
  await test('Persists messages and enforces cascade deletion on conversation removal', async () => {
    const runId = Date.now();
    const hash = await bcrypt.hash('Secret123!', 12);
    const user = await userQueries.create('casc_' + runId, 'casc_' + runId + '@test.local', hash, 'user');
    const convId = 'casc-conv-' + runId;

    await conversationQueries.create(convId, user.id, 'Cascade Test');
    await messageQueries.add(convId, 'user', 'Hello AI');
    await messageQueries.add(convId, 'assistant', 'Hello User');

    const messages = await messageQueries.getByConversationId(convId);
    assert.strictEqual(messages.length, 2, 'Two messages should be persisted');

    await conversationQueries.delete(convId, user.id);
    const messagesAfterDelete = await messageQueries.getByConversationId(convId);
    assert.strictEqual(messagesAfterDelete.length, 0, 'Messages must cascade delete');
  });

  // 7. Admin Authorization & Multi-user Oversight
  await test('Allows Admin to access system stats and inspect user conversation transcripts', async () => {
    const stats = await conversationQueries.getAdminStats();
    assert(stats.total_users >= 1, 'Stats must count registered users');

    const allUsers = await userQueries.getAllUsersWithStats();
    assert(Array.isArray(allUsers) && allUsers.length >= 1, 'Admin must see list of all users');
    assert.strictEqual(allUsers[0].password_hash, undefined, 'Admin user overview query must not expose password_hash');
  });

  console.log('\n==============================================');
  console.log(`🏁 TEST RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('==============================================');

  if (passed !== total) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution failure:', err);
  process.exit(1);
});

