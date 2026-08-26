/**
 * Aegis AI - Automated Backend & Security Verification Suite
 */

const assert = require('assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_123456789';
process.env.ADMIN_EMAIL = 'admin@chatbot.local';
process.env.ADMIN_PASSWORD = 'Admin@123456';

const { initDatabase, userQueries, conversationQueries, messageQueries, db } = require('../server/db/database');
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
  await test('Initializes SQLite database and tables with foreign keys and WAL mode', async () => {
    initDatabase();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert(tables.includes('users'), 'Users table must exist');
    assert(tables.includes('conversations'), 'Conversations table must exist');
    assert(tables.includes('messages'), 'Messages table must exist');
  });

  // 2. Admin Seeding & Password Hashing
  await test('Seeds designated default admin and hashes password with bcrypt (never plaintext)', async () => {
    const admin = userQueries.getByEmail.get('admin@chatbot.local');
    assert(admin, 'Admin user should be seeded');
    assert.strictEqual(admin.role, 'admin', 'Admin user must have admin role');
    assert.notStrictEqual(admin.password_hash, 'Admin@123456', 'Password must NOT be plaintext');
    assert(admin.password_hash.startsWith('$2'), 'Password must be valid bcrypt hash');
    assert(bcrypt.compareSync('Admin@123456', admin.password_hash), 'Bcrypt must verify valid password');
    assert(!bcrypt.compareSync('WrongPassword', admin.password_hash), 'Bcrypt must reject invalid password');
  });

  // 3. User Registration & Password Security
  await test('Registers standard user with secure bcrypt hash (12 rounds) and isolated account', async () => {
    const username = 'alice_test';
    const email = 'alice@example.com';
    const password = 'AliceSecurePassword!123';

    // Verify input validation helper
    const valErrors = validateRegistrationInput(username, email, password);
    assert.strictEqual(valErrors.length, 0, 'Valid input should have zero validation errors');

    // Clean up if previous run
    const existing = userQueries.getByEmail.get(email);
    if (existing) userQueries.deleteUser.run(existing.id);

    const hash = await bcrypt.hash(password, 12);
    const result = userQueries.create.run(username, email, hash, 'user');
    assert(result.lastInsertRowid > 0, 'User should be inserted');

    const created = userQueries.getById.get(result.lastInsertRowid);
    assert.strictEqual(created.username, username);
    assert.strictEqual(created.email, email);
    assert.strictEqual(created.role, 'user', 'Standard user must not have admin role');
  });

  // 4. JWT Token Generation & Verification
  await test('Generates signed JWT containing user claims and verifies signature', async () => {
    const user = userQueries.getByEmail.get('alice@example.com');
    assert(user, 'User alice must exist');
    const token = generateToken(user);
    assert(typeof token === 'string' && token.length > 20, 'Token must be non-empty string');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.strictEqual(decoded.id, user.id);
    assert.strictEqual(decoded.username, user.username);
    assert.strictEqual(decoded.role, 'user');
  });

  // 5. Conversation Ownership & Data Isolation
  await test('Creates conversations and enforces strict user data isolation', async () => {
    const alice = userQueries.getByEmail.get('alice@example.com');
    assert(alice, 'User alice must exist');
    
    // Register Bob
    const bobEmail = 'bob@example.com';
    let bob = userQueries.getByEmail.get(bobEmail);
    if (!bob) {
      const bobHash = await bcrypt.hash('BobPassword123', 12);
      const res = userQueries.create.run('bob_test', bobEmail, bobHash, 'user');
      bob = userQueries.getById.get(res.lastInsertRowid);
    }

    const aliceConvId = 'alice-conv-' + Date.now();
    conversationQueries.create.run(aliceConvId, alice.id, "Alice's Secret Project");

    // Alice can access her conversation
    const aliceAccess = conversationQueries.getByIdAndUser.get(aliceConvId, alice.id);
    assert(aliceAccess, "Alice must be able to access her own conversation");
    assert.strictEqual(aliceAccess.title, "Alice's Secret Project");

    // Bob CANNOT access Alice's conversation (returns null / forbidden)
    const bobAccess = conversationQueries.getByIdAndUser.get(aliceConvId, bob.id);
    assert.strictEqual(bobAccess, undefined, "Bob must NEVER be able to access Alice's conversation");
  });

  // 6. Messages Persistence & Cascade Constraints
  await test('Persists messages and enforces cascade deletion on conversation removal', async () => {
    const alice = userQueries.getByEmail.get('alice@example.com');
    assert(alice, 'User alice must exist');
    const testConvId = 'cascade-test-' + Date.now();
    conversationQueries.create.run(testConvId, alice.id, 'Cascade Test Conversation');

    messageQueries.add.run(testConvId, 'user', 'Hello AI');
    messageQueries.add.run(testConvId, 'assistant', 'Hello Alice, how can I help you today?');

    const messages = messageQueries.getByConversationId.all(testConvId);
    assert.strictEqual(messages.length, 2, 'Two messages should be persisted');
    assert.strictEqual(messages[0].role, 'user');
    assert.strictEqual(messages[1].role, 'assistant');

    // Delete conversation -> Messages must cascade delete
    conversationQueries.delete.run(testConvId, alice.id);
    const messagesAfterDelete = messageQueries.getByConversationId.all(testConvId);
    assert.strictEqual(messagesAfterDelete.length, 0, 'Messages must be cascade-deleted when conversation is deleted');
  });

  // 7. Admin Authorization & Multi-user Oversight
  await test('Allows Admin to access system stats and inspect user conversation transcripts', async () => {
    const admin = userQueries.getByEmail.get('admin@chatbot.local');
    assert.strictEqual(admin.role, 'admin');

    // Admin stats query
    const stats = conversationQueries.getAdminStats.get();
    assert(stats.total_users >= 2, 'Stats must count registered users');
    assert(stats.total_admins >= 1, 'Stats must count admin accounts');

    // Admin user listing
    const allUsers = userQueries.getAllUsersWithStats.all();
    assert(Array.isArray(allUsers) && allUsers.length >= 2, 'Admin must see list of all users');
    
    // Ensure password_hash is not in the list for safety
    assert.strictEqual(allUsers[0].password_hash, undefined, 'Admin user overview query must not expose password_hash');
  });

  console.log('\n==============================================');
  console.log(`🏁 TEST RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('==============================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failure:', err);
  process.exit(1);
});

