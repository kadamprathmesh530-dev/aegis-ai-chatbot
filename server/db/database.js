const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Neon PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database tables
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email
      ON users(email);

    CREATE INDEX IF NOT EXISTS idx_users_username
      ON users(username);

    CREATE INDEX IF NOT EXISTS idx_conversations_user
      ON conversations(user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at ASC);
  `);

  await seedAdminUser();
}

// Seed admin account
async function seedAdminUser() {
  const adminEmail =
    (process.env.ADMIN_EMAIL || 'admin@chatbot.local')
      .toLowerCase()
      .trim();

  const adminUsername =
    (process.env.ADMIN_USERNAME || 'admin').trim();

  const adminPassword =
    process.env.ADMIN_PASSWORD || 'Admin@123456';

  const existingAdmin = await pool.query(
    'SELECT id, role FROM users WHERE email = $1 OR role = $2 LIMIT 1',
    [adminEmail, 'admin']
  );

  if (existingAdmin.rows.length === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    try {
      await pool.query(
        `INSERT INTO users
        (username, email, password_hash, role)
        VALUES ($1, $2, $3, 'admin')`,
        [adminUsername, adminEmail, passwordHash]
      );

      console.log(`[DB] Designated Admin account created: ${adminEmail}`);
    } catch (err) {
      console.error(
        '[DB] Error creating default admin account:',
        err.message
      );
    }
  }
}

/*
 * USER QUERIES
 * PostgreSQL versions of the old SQLite queries
 */
const userQueries = {

  getByEmail: async (email) => {
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0] || null;
  },

  getByUsername: async (username) => {
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    return result.rows[0] || null;
  },

  getById: async (id) => {
    const result = await pool.query(
      `SELECT id, username, email, role, created_at, last_login_at
       FROM users
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  getByIdWithPassword: async (id) => {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  create: async (username, email, passwordHash, role) => {
    const result = await pool.query(
      `INSERT INTO users
       (username, email, password_hash, role)
       VALUES ($1, LOWER($2), $3, $4)
       RETURNING *`,
      [username, email, passwordHash, role]
    );

    return result.rows[0];
  },

  updateLastLogin: async (id) => {
    return pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  },

  updateRole: async (role, id) => {
    return pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role, id]
    );
  },

  updatePassword: async (passwordHash, id) => {
    return pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
  },

  deleteUser: async (id) => {
    return pool.query(
      'DELETE FROM users WHERE id = $1',
      [id]
    );
  },

  getAllUsersWithStats: async () => {
    const result = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        u.last_login_at,
        COUNT(DISTINCT c.id)::int AS conversation_count,
        COUNT(m.id)::int AS message_count
      FROM users u
      LEFT JOIN conversations c ON u.id = c.user_id
      LEFT JOIN messages m ON c.id = m.conversation_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return result.rows;
  },

  getUserCount: async () => {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM users'
    );

    return result.rows[0];
  }
};

/*
 * CONVERSATION QUERIES
 */
const conversationQueries = {

  getByUserId: async (userId) => {
    const result = await pool.query(`
      SELECT
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        (
          SELECT content
          FROM messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT COUNT(*)::int
          FROM messages
          WHERE conversation_id = c.id
        ) AS message_count
      FROM conversations c
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC
    `, [userId]);

    return result.rows;
  },

  getById: async (id) => {
    const result = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  getByIdAndUser: async (id, userId) => {
    const result = await pool.query(
      `SELECT *
       FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  create: async (id, userId, title) => {
    return pool.query(
      `INSERT INTO conversations
       (id, user_id, title)
       VALUES ($1, $2, $3)`,
      [id, userId, title]
    );
  },

  updateTitle: async (title, id, userId) => {
    return pool.query(
      `UPDATE conversations
       SET title = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [title, id, userId]
    );
  },

  touchUpdatedAt: async (id) => {
    return pool.query(
      `UPDATE conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  },

  delete: async (id, userId) => {
    return pool.query(
      `DELETE FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  },

  deleteByAdmin: async (id) => {
    return pool.query(
      'DELETE FROM conversations WHERE id = $1',
      [id]
    );
  },

  getAdminStats: async () => {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS total_admins,
        (SELECT COUNT(*)::int FROM conversations) AS total_conversations,
        (SELECT COUNT(*)::int FROM messages) AS total_messages,
        (
          SELECT COUNT(DISTINCT user_id)::int
          FROM conversations
          WHERE updated_at >= NOW() - INTERVAL '24 hours'
        ) AS active_users_24h
    `);

    return result.rows[0];
  },

  getAllConversationsForAdmin: async () => {
    const result = await pool.query(`
      SELECT
        c.id,
        c.user_id,
        u.username,
        u.email,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id)::int AS message_count
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN messages m ON c.id = m.conversation_id
      GROUP BY c.id, u.username, u.email
      ORDER BY c.updated_at DESC
    `);

    return result.rows;
  },

  getConversationsBySpecificUserForAdmin: async (userId) => {
    const result = await pool.query(`
      SELECT
        c.id,
        c.user_id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id)::int AS message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [userId]);

    return result.rows;
  }
};

/*
 * MESSAGE QUERIES
 */
const messageQueries = {

  getByConversationId: async (conversationId) => {
    const result = await pool.query(`
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [conversationId]);

    return result.rows;
  },

  add: async (conversationId, role, content) => {
    const result = await pool.query(`
      INSERT INTO messages
      (conversation_id, role, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [conversationId, role, content]);

    return result.rows[0];
  },

  getRecentContext: async (conversationId, limit) => {
    const result = await pool.query(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [conversationId, limit]);

    return result.rows;
  }
};

module.exports = {
  pool,
  initDatabase,
  userQueries,
  conversationQueries,
  messageQueries
};