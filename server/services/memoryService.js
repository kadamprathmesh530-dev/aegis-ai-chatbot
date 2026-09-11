const { memoryQueries } = require("../db/memory");

/**
 * AegisAI Memory Service
 *
 * Keeps memory logic separate from routes.
 * All operations are scoped to the authenticated user.
 */

/**
 * Get memories for the current user.
 */
async function getUserMemories(userId, limit = 20) {
  if (!userId) {
    return [];
  }

  return memoryQueries.getByUserId(userId, limit);
}

/**
 * Build a compact memory context for the AI prompt.
 *
 * This converts database rows into readable context.
 */
async function buildMemoryContext(userId, limit = 20) {
  const memories = await getUserMemories(userId, limit);

  if (!memories.length) {
    return "";
  }

  const lines = memories.map((memory) => {
    return `- [${memory.category}] ${memory.memory_key}: ${memory.memory_value}`;
  });

  return `
LONG-TERM USER MEMORY
The following information may help you personalize your response.
Use it only when relevant to the current request.

${lines.join("\n")}
`;
}

/**
 * Save or update a memory.
 */
async function saveMemory({
  userId,
  category,
  memoryKey,
  memoryValue,
  importance = 5,
  confidence = 0.8,
  source = "conversation",
  expiresAt = null,
}) {
  if (!userId) {
    throw new Error("userId is required to save memory.");
  }

  if (!category || !memoryKey || !memoryValue) {
    throw new Error("category, memoryKey and memoryValue are required.");
  }

  return memoryQueries.upsert({
    userId,
    category,
    memoryKey,
    memoryValue,
    importance,
    confidence,
    source,
    expiresAt,
  });
}

/**
 * Mark memories as recently used.
 */
async function markMemoriesAccessed(userId, memoryIds) {
  if (!userId || !Array.isArray(memoryIds)) {
    return;
  }

  await memoryQueries.markAccessed(userId, memoryIds);
}

/**
 * Deactivate one memory.
 */
async function removeMemory(userId, memoryId) {
  if (!userId || !memoryId) {
    return null;
  }

  return memoryQueries.deactivate(userId, memoryId);
}

/**
 * Delete every memory belonging to a user.
 */
async function clearUserMemories(userId) {
  if (!userId) {
    throw new Error("userId is required.");
  }

  await memoryQueries.deleteAllForUser(userId);
}

module.exports = {
  getUserMemories,
  buildMemoryContext,
  saveMemory,
  markMemoriesAccessed,
  removeMemory,
  clearUserMemories,
};
