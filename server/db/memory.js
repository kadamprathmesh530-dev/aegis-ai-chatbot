const { pool } = require("./database");

/**
 * AegisAI Long-Term Memory
 *
 * Stores only useful, non-sensitive user memories.
 * Every query is scoped by authenticated userId.
 */

const memoryQueries = {
  /**
   * Create the memory table and indexes.
   */
  async init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id SERIAL PRIMARY KEY,

        user_id INTEGER NOT NULL,

        category TEXT NOT NULL
          CHECK (
            category IN (
              'preference',
              'fact',
              'project',
              'goal',
              'context'
            )
          ),

        memory_key TEXT NOT NULL,
        memory_value TEXT NOT NULL,

        importance INTEGER NOT NULL DEFAULT 5
          CHECK (importance BETWEEN 1 AND 10),

        confidence NUMERIC(3,2) NOT NULL DEFAULT 0.80
          CHECK (confidence >= 0 AND confidence <= 1),

        source TEXT NOT NULL DEFAULT 'conversation',

        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TIMESTAMPTZ,

        access_count INTEGER NOT NULL DEFAULT 0,

        is_active BOOLEAN NOT NULL DEFAULT TRUE,

        expires_at TIMESTAMPTZ,

        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE,

        UNIQUE (user_id, category, memory_key)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_memories_user
      ON user_memories(user_id, is_active);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_memories_category
      ON user_memories(user_id, category, is_active);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_memories_updated
      ON user_memories(user_id, updated_at DESC);
    `);

    console.log("[MEMORY] Memory table initialized.");
  },

  /**
   * Get active memories for one authenticated user.
   */
  async getByUserId(userId, limit = 50) {
    const result = await pool.query(
      `
        SELECT
          id,
          category,
          memory_key,
          memory_value,
          importance,
          confidence,
          source,
          created_at,
          updated_at,
          last_accessed_at,
          access_count,
          expires_at
        FROM user_memories
        WHERE user_id = $1
          AND is_active = TRUE
          AND (
            expires_at IS NULL
            OR expires_at > CURRENT_TIMESTAMP
          )
        ORDER BY
          importance DESC,
          updated_at DESC
        LIMIT $2
      `,
      [userId, limit],
    );

    return result.rows;
  },

  /**
   * Create or update one memory.
   */
  async upsert({
    userId,
    category,
    memoryKey,
    memoryValue,
    importance = 5,
    confidence = 0.8,
    source = "conversation",
    expiresAt = null,
  }) {
    const result = await pool.query(
      `
        INSERT INTO user_memories (
          user_id,
          category,
          memory_key,
          memory_value,
          importance,
          confidence,
          source,
          expires_at,
          last_accessed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id, category, memory_key)
        DO UPDATE SET
          memory_value = EXCLUDED.memory_value,
          importance = EXCLUDED.importance,
          confidence = EXCLUDED.confidence,
          source = EXCLUDED.source,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP,
          is_active = TRUE

        RETURNING *
      `,
      [
        userId,
        category,
        memoryKey,
        memoryValue,
        importance,
        confidence,
        source,
        expiresAt,
      ],
    );

    return result.rows[0];
  },

  /**
   * Mark memories as accessed.
   */
  async markAccessed(userId, memoryIds) {
    if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
      return;
    }

    await pool.query(
      `
        UPDATE user_memories
        SET
          access_count = access_count + 1,
          last_accessed_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
          AND id = ANY($2::INTEGER[])
          AND is_active = TRUE
      `,
      [userId, memoryIds],
    );
  },

  /**
   * Soft-delete one memory.
   */
  async deactivate(userId, memoryId) {
    const result = await pool.query(
      `
        UPDATE user_memories
        SET
          is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND user_id = $2
        RETURNING id
      `,
      [memoryId, userId],
    );

    return result.rows[0] || null;
  },

  /**
   * Delete all memories belonging to one user.
   */
  async deleteAllForUser(userId) {
    await pool.query(
      `
        DELETE FROM user_memories
        WHERE user_id = $1
      `,
      [userId],
    );
  },
};

module.exports = {
  memoryQueries,
};
