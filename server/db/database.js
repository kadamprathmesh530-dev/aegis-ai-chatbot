const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'chatbot.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for optimal concurrency & integrity
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize database schema
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at ASC);
  `);

  seedAdminUser();
}

// Ensure schema is created before compiling prepared statements
initDatabase();

// Seed designated admin user if not already present
function seedAdminUser() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@chatbot.local').toLowerCase().trim();
  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

  const existingAdmin = db.prepare('SELECT id, role FROM users WHERE email = ? OR role = ?').get(adminEmail, 'admin');

  if (!existingAdmin) {
    const saltRounds = 12;
    const passwordHash = bcrypt.hashSync(adminPassword, saltRounds);
    
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `);
    
    try {
      stmt.run(adminUsername, adminEmail, passwordHash);
      console.log(`[DB] Designated Admin account created: ${adminEmail}`);
    } catch (err) {
      console.error('[DB] Error creating default admin account:', err.message);
    }
  }
}

// User operations
const userQueries = {
  getByEmail: db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)'),
  getByUsername: db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)'),
  getById: db.prepare('SELECT id, username, email, role, created_at, last_login_at FROM users WHERE id = ?'),
  getByIdWithPassword: db.prepare('SELECT * FROM users WHERE id = ?'),
  create: db.prepare(`
    INSERT INTO users (username, email, password_hash, role)
    VALUES (?, LOWER(?), ?, ?)
  `),
  updateLastLogin: db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updateRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  updatePassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  getAllUsersWithStats: db.prepare(`
    SELECT 
      u.id, 
      u.username, 
      u.email, 
      u.role, 
      u.created_at, 
      u.last_login_at,
      COUNT(DISTINCT c.id) AS conversation_count,
      COUNT(m.id) AS message_count
    FROM users u
    LEFT JOIN conversations c ON u.id = c.user_id
    LEFT JOIN messages m ON c.id = m.conversation_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `),
  getUserCount: db.prepare('SELECT COUNT(*) as count FROM users')
};

// Conversation operations
const conversationQueries = {
  getByUserId: db.prepare(`
    SELECT 
      c.id, 
      c.title, 
      c.created_at, 
      c.updated_at,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count
    FROM conversations c
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC
  `),
  getById: db.prepare('SELECT * FROM conversations WHERE id = ?'),
  getByIdAndUser: db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?'),
  create: db.prepare(`
    INSERT INTO conversations (id, user_id, title)
    VALUES (?, ?, ?)
  `),
  updateTitle: db.prepare(`
    UPDATE conversations 
    SET title = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND user_id = ?
  `),
  touchUpdatedAt: db.prepare(`
    UPDATE conversations 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `),
  delete: db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?'),
  deleteByAdmin: db.prepare('DELETE FROM conversations WHERE id = ?'),
  getAdminStats: db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS total_admins,
      (SELECT COUNT(*) FROM conversations) AS total_conversations,
      (SELECT COUNT(*) FROM messages) AS total_messages,
      (SELECT COUNT(DISTINCT user_id) FROM conversations WHERE updated_at >= datetime('now', '-24 hours')) AS active_users_24h
  `),
  getAllConversationsForAdmin: db.prepare(`
    SELECT 
      c.id, 
      c.user_id,
      u.username,
      u.email,
      c.title, 
      c.created_at, 
      c.updated_at,
      COUNT(m.id) AS message_count
    FROM conversations c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN messages m ON c.id = m.conversation_id
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `),
  getConversationsBySpecificUserForAdmin: db.prepare(`
    SELECT 
      c.id, 
      c.user_id,
      c.title, 
      c.created_at, 
      c.updated_at,
      COUNT(m.id) AS message_count
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `)
};

// Message operations
const messageQueries = {
  getByConversationId: db.prepare(`
    SELECT id, conversation_id, role, content, created_at 
    FROM messages 
    WHERE conversation_id = ? 
    ORDER BY created_at ASC
  `),
  add: db.prepare(`
    INSERT INTO messages (conversation_id, role, content)
    VALUES (?, ?, ?)
  `),
  getRecentContext: db.prepare(`
    SELECT role, content 
    FROM messages 
    WHERE conversation_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `)
};

module.exports = {
  db,
  initDatabase,
  userQueries,
  conversationQueries,
  messageQueries
};
