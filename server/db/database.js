const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected PostgreSQL pool error:', err);
});

/*
 * --------------------------------------------------
 * Database initialization
 * --------------------------------------------------
 */

async function initDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMPTZ,
        google_id TEXT UNIQUE,
        avatar_url TEXT,
        auth_provider TEXT NOT NULL DEFAULT 'email'
          CHECK (auth_provider IN ('email', 'google'))
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT 'New Conversation',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL
          CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id)
          REFERENCES conversations(id)
          ON DELETE CASCADE
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email
      ON users(email);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username
      ON users(username);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_google_id
      ON users(google_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user
      ON conversations(user_id, updated_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at ASC);
    `);

    await client.query('COMMIT');

    console.log('[DB] PostgreSQL database initialized.');

    await seedAdminUser();

  } catch (err) {
    await client.query('ROLLBACK');

    console.error(
      '[DB] Database initialization error:',
      err.message
    );

    throw err;

  } finally {
    client.release();
  }
}


/*
 * --------------------------------------------------
 * Admin seed
 * --------------------------------------------------
 */

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
    `
      SELECT id, role
      FROM users
      WHERE LOWER(email) = LOWER($1)
         OR role = 'admin'
      LIMIT 1
    `,
    [adminEmail]
  );

  if (existingAdmin.rows.length === 0) {

    const passwordHash =
      await bcrypt.hash(adminPassword, 12);

    try {

      await pool.query(
        `
          INSERT INTO users
            (username, email, password_hash, role, auth_provider)
          VALUES
            ($1, $2, $3, 'admin', 'email')
        `,
        [
          adminUsername,
          adminEmail,
          passwordHash
        ]
      );

      console.log(
        `[DB] Designated Admin account created: ${adminEmail}`
      );

    } catch (err) {

      console.error(
        '[DB] Error creating admin:',
        err.message
      );

    }
  }
}


/*
 * Initialize database once.
 *
 * Every query waits for this promise,
 * so tables are guaranteed to exist first.
 */

const databaseReady = initDatabase();


/*
 * --------------------------------------------------
 * User Queries
 * --------------------------------------------------
 */

const userQueries = {

  async getByEmail(email) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT *
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );

    return result.rows[0] || null;
  },


  async getByUsername(username) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT *
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [username]
    );

    return result.rows[0] || null;
  },


  async getById(id) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT
          id,
          username,
          email,
          role,
          created_at,
          last_login_at
        FROM users
        WHERE id = $1
      `,
      [id]
    );

    return result.rows[0] || null;
  },


  async getByIdWithPassword(id) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT *
        FROM users
        WHERE id = $1
      `,
      [id]
    );

    return result.rows[0] || null;
  },


  async create(username, email, passwordHash, role = 'user') {
    await databaseReady;

    const result = await pool.query(
      `
        INSERT INTO users
          (username, email, password_hash, role)
        VALUES
          ($1, LOWER($2), $3, $4)
        RETURNING *
      `,
      [
        username,
        email,
        passwordHash,
        role
      ]
    );

    return result.rows[0];
  },


  async updateLastLogin(id) {
    await databaseReady;

    await pool.query(
      `
        UPDATE users
        SET last_login_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [id]
    );
  },


  async updateRole(role, id) {
    await databaseReady;

    await pool.query(
      `
        UPDATE users
        SET role = $1
        WHERE id = $2
      `,
      [role, id]
    );
  },


  async updatePassword(passwordHash, id) {
    await databaseReady;

    await pool.query(
      `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
      `,
      [passwordHash, id]
    );
  },


  async deleteUser(id) {
    await databaseReady;

    await pool.query(
      `
        DELETE FROM users
        WHERE id = $1
      `,
      [id]
    );
  },


  /**
   * Get user by Google ID
   * Used for Google Sign-In to find existing Google-linked accounts
   */
  async getByGoogleId(googleId) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT
          id,
          username,
          email,
          role,
          created_at,
          last_login_at,
          google_id,
          avatar_url,
          auth_provider
        FROM users
        WHERE google_id = $1
        LIMIT 1
      `,
      [googleId]
    );

    return result.rows[0] || null;
  },


  /**
   * Create a new Google-only user
   * password_hash will be NULL for Google-only users
   * auth_provider will be 'google'
   */
  async createGoogleUser(username, email, googleId, avatarUrl) {
    await databaseReady;

    const result = await pool.query(
      `
        INSERT INTO users
          (username, email, password_hash, role, google_id, avatar_url, auth_provider)
        VALUES
          ($1, LOWER($2), NULL, 'user', $3, $4, 'google')
        RETURNING *
      `,
      [
        username,
        email,
        googleId,
        avatarUrl
      ]
    );

    return result.rows[0];
  },


  /**
   * Link a Google ID to an existing email/password user
   * This should only be called explicitly by the user in account settings
   * (not automatically during login)
   */
  async linkGoogleId(userId, googleId, avatarUrl) {
    await databaseReady;

    const result = await pool.query(
      `
        UPDATE users
        SET google_id = $2,
            avatar_url = COALESCE($3, avatar_url),
            auth_provider = 'google'
        WHERE id = $1
        RETURNING *
      `,
      [userId, googleId, avatarUrl]
    );

    return result.rows[0] || null;
  },


  async getAllUsersWithStats() {
    await databaseReady;

    const result = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        u.last_login_at,
        COUNT(DISTINCT c.id)::INTEGER AS conversation_count,
        COUNT(m.id)::INTEGER AS message_count
      FROM users u
      LEFT JOIN conversations c
        ON u.id = c.user_id
      LEFT JOIN messages m
        ON c.id = m.conversation_id
      GROUP BY
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        u.last_login_at
      ORDER BY u.created_at DESC
    `);

    return result.rows;
  },


  async getUserCount() {
    await databaseReady;

    const result = await pool.query(`
      SELECT COUNT(*)::INTEGER AS count
      FROM users
    `);

    return result.rows[0];
  }
};


/*
 * --------------------------------------------------
 * Conversation Queries
 * --------------------------------------------------
 */

const conversationQueries = {

  async getByUserId(userId) {
    await databaseReady;

    const result = await pool.query(
      `
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
            SELECT COUNT(*)::INTEGER
            FROM messages
            WHERE conversation_id = c.id
          ) AS message_count

        FROM conversations c

        WHERE c.user_id = $1

        ORDER BY c.updated_at DESC
      `,
      [userId]
    );

    return result.rows;
  },


  async getById(id) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT *
        FROM conversations
        WHERE id = $1
      `,
      [id]
    );

    return result.rows[0] || null;
  },


  async getByIdAndUser(id, userId) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT *
        FROM conversations
        WHERE id = $1
          AND user_id = $2
      `,
      [
        id,
        userId
      ]
    );

    return result.rows[0] || null;
  },


  async create(id, userId, title) {
    await databaseReady;

    const result = await pool.query(
      `
        INSERT INTO conversations
          (id, user_id, title)
        VALUES
          ($1, $2, $3)
        RETURNING *
      `,
      [
        id,
        userId,
        title
      ]
    );

    return result.rows[0];
  },


  async updateTitle(title, id, userId) {
    await databaseReady;

    const result = await pool.query(
      `
        UPDATE conversations
        SET
          title = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
          AND user_id = $3
        RETURNING *
      `,
      [
        title,
        id,
        userId
      ]
    );

    return result.rows[0] || null;
  },


  async touchUpdatedAt(id) {
    await databaseReady;

    await pool.query(
      `
        UPDATE conversations
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [id]
    );
  },


  async delete(id, userId) {
    await databaseReady;

    await pool.query(
      `
        DELETE FROM conversations
        WHERE id = $1
          AND user_id = $2
      `,
      [
        id,
        userId
      ]
    );
  },


  async deleteByAdmin(id) {
    await databaseReady;

    await pool.query(
      `
        DELETE FROM conversations
        WHERE id = $1
      `,
      [id]
    );
  },


  async getAdminStats() {
    await databaseReady;

    const result = await pool.query(`
      SELECT

        (SELECT COUNT(*)::INTEGER
         FROM users) AS total_users,

        (SELECT COUNT(*)::INTEGER
         FROM users
         WHERE role = 'admin') AS total_admins,

        (SELECT COUNT(*)::INTEGER
         FROM conversations) AS total_conversations,

        (SELECT COUNT(*)::INTEGER
         FROM messages) AS total_messages,

        (
          SELECT COUNT(DISTINCT user_id)::INTEGER
          FROM conversations
          WHERE updated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ) AS active_users_24h
    `);

    return result.rows[0];
  },


  async getAllConversationsForAdmin() {
    await databaseReady;

    const result = await pool.query(`
      SELECT
        c.id,
        c.user_id,
        u.username,
        u.email,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id)::INTEGER AS message_count

      FROM conversations c

      JOIN users u
        ON c.user_id = u.id

      LEFT JOIN messages m
        ON c.id = m.conversation_id

      GROUP BY
        c.id,
        c.user_id,
        u.username,
        u.email,
        c.title,
        c.created_at,
        c.updated_at

      ORDER BY c.updated_at DESC
    `);

    return result.rows;
  },


  async getConversationsBySpecificUserForAdmin(userId) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT
          c.id,
          c.user_id,
          c.title,
          c.created_at,
          c.updated_at,
          COUNT(m.id)::INTEGER AS message_count

        FROM conversations c

        LEFT JOIN messages m
          ON c.id = m.conversation_id

        WHERE c.user_id = $1

        GROUP BY
          c.id,
          c.user_id,
          c.title,
          c.created_at,
          c.updated_at

        ORDER BY c.updated_at DESC
      `,
      [userId]
    );

    return result.rows;
  }
};


/*
 * --------------------------------------------------
 * Message Queries
 * --------------------------------------------------
 */

const messageQueries = {

  async getByConversationId(conversationId) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT
          id,
          conversation_id,
          role,
          content,
          created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );

    return result.rows;
  },


  async add(conversationId, role, content) {
    await databaseReady;

    const result = await pool.query(
      `
        INSERT INTO messages
          (conversation_id, role, content)
        VALUES
          ($1, $2, $3)
        RETURNING
          id,
          conversation_id,
          role,
          content,
          created_at
      `,
      [
        conversationId,
        role,
        content
      ]
    );

    return result.rows[0];
  },


  async getRecentContext(conversationId, limit = 10) {
    await databaseReady;

    const result = await pool.query(
      `
        SELECT
          role,
          content
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [
        conversationId,
        limit
      ]
    );

    return result.rows;
  }
};


/*
 * --------------------------------------------------
 * Exports
 * --------------------------------------------------
 */

module.exports = {
  pool,
  db: pool,
  initDatabase,
  userQueries,
  conversationQueries,
  messageQueries
};