const { memoryQueries } = require('../db/memory');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
 *
 * Returns the prompt-ready context string together with the IDs of
 * the memories that were actually included, so callers can mark
 * exactly those memories as accessed (never the whole memory list).
 */
async function buildMemoryContext(userId, limit = 20) {
  const memories = await getUserMemories(userId, limit);

  if (!memories.length) {
    return {
      context: '',
      memoryIds: [],
    };
  }

  const lines = memories.map((memory) => {
    return `- [${memory.category}] ${memory.memory_key}: ${memory.memory_value}`;
  });

  const context = `
LONG-TERM USER MEMORY
The following information may help you personalize your response.
Use it only when relevant to the current request.

${lines.join('\n')}
`;

  return {
    context,
    // IDs of the memories actually included in the context above.
    memoryIds: memories.map((memory) => memory.id),
  };
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
  confidence = 0.80,
  source = 'conversation',
  expiresAt = null
}) {
  if (!userId) {
    throw new Error('userId is required to save memory.');
  }

  if (!category || !memoryKey || !memoryValue) {
    throw new Error(
      'category, memoryKey and memoryValue are required.'
    );
  }

  return memoryQueries.upsert({
    userId,
    category,
    memoryKey,
    memoryValue,
    importance,
    confidence,
    source,
    expiresAt
  });
}

/**
 * Mark memories as recently used.
 */
async function markMemoriesAccessed(userId, memoryIds) {
  if (!userId || !Array.isArray(memoryIds)) {
    return;
  }

  await memoryQueries.markAccessed(
    userId,
    memoryIds
  );
}

/**
 * Deactivate one memory.
 */
async function removeMemory(userId, memoryId) {
  if (!userId || !memoryId) {
    return null;
  }

  return memoryQueries.deactivate(
    userId,
    memoryId
  );
}

/**
 * Delete every memory belonging to a user.
 */
async function clearUserMemories(userId) {
  if (!userId) {
    throw new Error('userId is required.');
  }

  await memoryQueries.deleteAllForUser(userId);
}

/**
 * ============================================================
 * AUTOMATIC MEMORY EXTRACTION (Phase 1)
 *
 * Uses the same Gemini infrastructure as the chat routes
 * (@google/generative-ai, GEMINI_API_KEY) to detect useful
 * long-term information from ONE user/assistant exchange.
 *
 * Safety rules:
 * - Only the authenticated userId passed into
 *   extractAndSaveMemories() is ever used. The model never
 *   supplies a userId and cannot choose another owner.
 * - Secrets (passwords, API keys, tokens, financial
 *   credentials, government IDs, security material) are
 *   rejected by prompt rules AND by local pattern checks.
 * - Only explicit / clearly communicated information is kept.
 * - Values are concise and hard-capped in length.
 * - The existing saveMemory() (user scoping, validation,
 *   upsert on the unique (user_id, category, memory_key))
 *   stays the single write path, so a newer value for the
 *   same memory_key updates the existing row instead of
 *   creating duplicates.
 * ============================================================
 */

const MEMORY_CATEGORIES = [
  'preference',
  'fact',
  'project',
  'goal',
  'context',
];

// Same Gemini model family used by the chat routes' fallback chain.
const MEMORY_EXTRACTION_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
];

const MAX_MEMORIES_PER_EXTRACTION = 5;
const MIN_USER_MESSAGE_LENGTH = 12;
const MAX_USER_MESSAGE_CHARS = 2000;
const MAX_ASSISTANT_MESSAGE_CHARS = 2000;
const MEMORY_KEY_MAX_LENGTH = 80;
const MEMORY_VALUE_MAX_LENGTH = 300;
const MEMORY_EXTRACTION_TIMEOUT_MS = 20000;

const MEMORY_EXTRACTION_SYSTEM_INSTRUCTION = `
You extract long-term memories about ONE user from a single
user/assistant chat exchange.

Return STRICT JSON only, with exactly this shape:
{"memories":[{"category":"...","memory_key":"...","memory_value":"...","importance":5,"confidence":0.8}]}

Rules:
- category MUST be exactly one of: preference, fact, project, goal, context.
- memory_key: short, stable snake_case identifier (max 80 characters) that
  stays the same whenever the same topic is updated later
  (examples: "favorite_programming_language", "occupation", "current_project").
- memory_value: one concise fact (max 300 characters).
- importance: integer 1-10 (10 = defining, long-term important).
- confidence: number between 0.0 and 1.0.
- Extract ONLY information the user explicitly or clearly communicated
  about themselves. Do NOT infer, guess, or fill in missing information.
- NEVER store: passwords, API keys, tokens, secrets, authentication or
  credential material, credit card or bank details, government IDs, or
  any other sensitive or security-related information.
- Do NOT store temporary conversation details, instructions, questions,
  or anything only relevant to this single exchange.
- Do NOT store information about the assistant or generic world knowledge.
- Reuse the same memory_key when a newer value replaces an older one.
- Maximum 5 memories. If there is nothing useful, return:
  {"memories":[]}
- Output raw JSON only. No markdown, no explanations.
`;

const SENSITIVE_MEMORY_PATTERN =
  /(password|passwd|pwd|secret|api[_\s-]?key|apikey|access[_\s-]?token|auth[_\s-]?token|refresh[_\s-]?token|bearer\s|credential|private[_\s-]?key|ssh[_\s-]?key|credit[_\s-]?card|card\s*number|cvv|cvc|debit\s*card|bank\s*account|ifsc\s*code|upi\s*pin|otp|one[\s_-]?time[\s_-]?password|ssn|aadhaar|pan\s*number|passport\s*number)/i;

const SENSITIVE_TOKEN_SHAPE =
  /\b(?:sk[-_][A-Za-z0-9]{8,}|gh[pous]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{10,})\b/;

function sanitizeMemoryKey(rawKey) {
  const key = String(rawKey || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!key) {
    return null;
  }

  return key.slice(0, MEMORY_KEY_MAX_LENGTH);
}

function sanitizeMemoryValue(rawValue) {
  const value = String(rawValue || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!value) {
    return null;
  }

  return value.slice(0, MEMORY_VALUE_MAX_LENGTH);
}

function clampImportance(rawImportance) {
  const value = Math.round(Number(rawImportance));

  if (!Number.isFinite(value)) {
    return 5;
  }

  return Math.min(10, Math.max(1, value));
}

function clampConfidence(rawConfidence) {
  const value = Number(rawConfidence);

  if (!Number.isFinite(value)) {
    return 0.8;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function isSensitiveMemory(category, memoryKey, memoryValue) {
  const haystack = `${category} ${memoryKey} ${memoryValue}`;

  return (
    SENSITIVE_MEMORY_PATTERN.test(haystack) ||
    SENSITIVE_TOKEN_SHAPE.test(haystack)
  );
}

function parseMemoryExtractionOutput(rawText) {
  const text = String(rawText || '').trim();

  if (!text) {
    return [];
  }

  // Strip markdown fences if the model added them anyway.
  const withoutFences = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  const startObject = withoutFences.indexOf('{');
  const startArray = withoutFences.indexOf('[');
  const start =
    startArray >= 0 && (startObject < 0 || startArray < startObject)
      ? startArray
      : startObject;

  const endObject = withoutFences.lastIndexOf('}');
  const endArray = withoutFences.lastIndexOf(']');
  const end =
    endArray >= 0 && (endObject < 0 || endArray > endObject)
      ? endArray
      : endObject;

  if (start < 0 || end <= start) {
    return [];
  }

  let parsed = null;

  try {
    parsed = JSON.parse(withoutFences.slice(start, end + 1));
  } catch (parseError) {
    return [];
  }

  const candidates = [];

  if (Array.isArray(parsed)) {
    candidates.push(...parsed);
  } else if (parsed && Array.isArray(parsed.memories)) {
    candidates.push(...parsed.memories);
  }

  return candidates;
}

function sanitizeExtractedMemories(rawMemories) {
  if (!Array.isArray(rawMemories)) {
    return [];
  }

  const sanitized = [];
  const seenKeys = new Set();

  for (const rawMemory of rawMemories) {
    if (sanitized.length >= MAX_MEMORIES_PER_EXTRACTION) {
      break;
    }

    if (!rawMemory || typeof rawMemory !== 'object') {
      continue;
    }

    const category = String(rawMemory.category || '').trim().toLowerCase();
    const memoryKey = sanitizeMemoryKey(
      rawMemory.memory_key ?? rawMemory.memoryKey,
    );
    const memoryValue = sanitizeMemoryValue(
      rawMemory.memory_value ?? rawMemory.memoryValue,
    );

    if (!MEMORY_CATEGORIES.includes(category)) {
      continue;
    }

    if (!memoryKey || !memoryValue) {
      continue;
    }

    if (isSensitiveMemory(category, memoryKey, memoryValue)) {
      continue;
    }

    const dedupeKey = `${category}::${memoryKey}`;

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);

    sanitized.push({
      category,
      memoryKey,
      memoryValue,
      importance: clampImportance(rawMemory.importance),
      confidence: clampConfidence(rawMemory.confidence),
    });
  }

  return sanitized;
}

/**
 * Run the extraction model with the existing Gemini infrastructure.
 * Tries the chat fallback model family in order and enforces a hard
 * timeout so a hanging model call can never stall a chat response.
 */
async function generateMemoryExtraction(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  let lastError = null;

  for (const modelName of MEMORY_EXTRACTION_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: MEMORY_EXTRACTION_SYSTEM_INSTRUCTION,
      });

      const extractionPromise = model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0,
        },
      });

      let timeoutId = null;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(
            `Memory extraction timed out after ${MEMORY_EXTRACTION_TIMEOUT_MS}ms.`,
          );
          timeoutError.code = 'MEMORY_EXTRACTION_TIMEOUT';
          reject(timeoutError);
        }, MEMORY_EXTRACTION_TIMEOUT_MS);
      });

      try {
        const result = await Promise.race([
          extractionPromise,
          timeoutPromise,
        ]);

        // If the timeout won the race, swallow the late model
        // rejection so it can never surface as an unhandled rejection.
        extractionPromise.catch(() => {});

        const text = String(result?.response?.text?.() || '').trim();

        if (!text) {
          throw new Error(
            `${modelName} returned an empty extraction response.`,
          );
        }

        return text;
      } catch (raceError) {
        extractionPromise.catch(() => {});
        throw raceError;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (modelError) {
      lastError = modelError;

      console.error(
        `[MEMORY] ⚠️ Extraction model ${modelName} failed:`,
        modelError?.message || modelError,
      );
    }
  }

  throw lastError || new Error('Memory extraction models failed.');
}

/**
 * Extract useful long-term information from one user/assistant
 * exchange and persist it through the existing saveMemory() path.
 *
 * Only the authenticated userId argument is ever used as the owner —
 * the model output can never change it.
 */
async function extractAndSaveMemories({
  userId,
  userMessage,
  assistantMessage,
}) {
  if (!userId) {
    return [];
  }

  const cleanedUserMessage =
    typeof userMessage === 'string' ? userMessage.trim() : '';
  const cleanedAssistantMessage =
    typeof assistantMessage === 'string' ? assistantMessage.trim() : '';

  // Ignore very short or empty exchanges — nothing worth learning.
  if (
    cleanedUserMessage.length < MIN_USER_MESSAGE_LENGTH ||
    !cleanedAssistantMessage
  ) {
    return [];
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log(
      '[MEMORY] Extraction skipped: GEMINI_API_KEY is not configured.',
    );

    return [];
  }

  const prompt = `
USER MESSAGE:
${cleanedUserMessage.slice(0, MAX_USER_MESSAGE_CHARS)}

ASSISTANT RESPONSE:
${cleanedAssistantMessage.slice(0, MAX_ASSISTANT_MESSAGE_CHARS)}

Extract long-term memories about the user now. Respond with strict JSON only.
`;

  const rawExtraction = await generateMemoryExtraction(prompt);

  const sanitizedMemories = sanitizeExtractedMemories(
    parseMemoryExtractionOutput(rawExtraction),
  );

  if (!sanitizedMemories.length) {
    return [];
  }

  const savedMemories = [];

  for (const memoryCandidate of sanitizedMemories) {
    try {
      // saveMemory() centralizes user scoping, validation and the
      // (user_id, category, memory_key) upsert, so a newer value for
      // the same memory_key updates the existing row.
      const savedMemory = await saveMemory({
        userId,
        category: memoryCandidate.category,
        memoryKey: memoryCandidate.memoryKey,
        memoryValue: memoryCandidate.memoryValue,
        importance: memoryCandidate.importance,
        confidence: memoryCandidate.confidence,
        source: 'conversation',
      });

      if (savedMemory) {
        savedMemories.push(savedMemory);
      }
    } catch (saveMemoryError) {
      console.error(
        '[MEMORY] Failed to save extracted memory:',
        saveMemoryError?.message || saveMemoryError,
      );
    }
  }

  if (savedMemories.length) {
    console.log(
      `[MEMORY] Saved ${savedMemories.length} extracted memory/memories.`,
    );
  }

  return savedMemories;
}

module.exports = {
  getUserMemories,
  buildMemoryContext,
  saveMemory,
  markMemoriesAccessed,
  removeMemory,
  clearUserMemories,
  extractAndSaveMemories
};