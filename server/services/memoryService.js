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
async function buildMemoryContext(userId, limit = 8, userMessage) {
  try {
    let memories;

    if (userMessage && typeof userMessage === 'string' && userMessage.trim().length > 0) {
      // Phase 2: Fetch a broad candidate set, score by relevance, take top N.
      const candidates = await memoryQueries.getRelevantByUserId(userId, 40);

      if (candidates.length === 0) {
        return {
          context: '',
          memoryIds: [],
        };
      }

      const userMessageTokens = tokenize(userMessage);

      // Score every candidate.
      const scored = candidates.map((memory) => ({
        memory,
        score: computeRelevanceScore(memory, userMessageTokens),
      }));

      // Sort by score descending.
      scored.sort((a, b) => b.score - a.score);

      // Take only the top `limit` memories.
      memories = scored.slice(0, limit).map((entry) => entry.memory);
    } else {
      // Fallback: preserve Phase 1 behavior when no user message is supplied.
      memories = await getUserMemories(userId, limit);
    }

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
  } catch (error) {
    // A retrieval/scoring failure must never break the chat response.
    console.error('[MEMORY CONTEXT ERROR]', error?.message || error);

    return {
      context: '',
      memoryIds: [],
    };
  }
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
 * RELEVANCE SCORING (Phase 2)
 * ============================================================
 */

// Common English stop words that should not dominate relevance scoring.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
  'be', 'as', 'do', 'did', 'have', 'has', 'had', 'i', 'you', 'we', 'they',
  'my', 'your', 'our', 'their', 'me', 'him', 'her', 'them', 'what', 'which',
  'who', 'how', 'when', 'where', 'not', 'no', 'yes', 'if', 'then', 'so',
  'its', 'his', 'hers', 'just', 'about', 'also', 'can', 'will', 'would',
  'should', 'could', 'may', 'might', 'shall', 'more', 'most', 'some', 'any',
  'all', 'each', 'every', 'both', 'few', 'many', 'much', 'such', 'than',
  'too', 'very', 'just', 'because', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
  'again', 'further', 'once', 'here', 'there', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'don', 'now',
]);

/*
 * Small semantic-expansion map for common concept clusters.
 *
 * Bridges lexical gaps without embeddings or external services.
 * For example, a user asking about "dinner" should match a memory
 * stored under "food", even though the two words share no letters.
 *
 * Each entry maps a token to an array of semantically related tokens.
 * The map is intentionally small and focused on everyday concept
 * clusters that matter for personal-memory retrieval.
 */
const RELATED_TOKENS = {
  dinner: ['food', 'meal', 'eat', 'lunch', 'breakfast'],
  food: ['dinner', 'meal', 'eat', 'lunch', 'breakfast', 'cook'],
  meal: ['food', 'dinner', 'eat', 'lunch'],
  eat: ['food', 'dinner', 'meal', 'lunch', 'breakfast'],
  lunch: ['food', 'meal', 'dinner', 'eat'],
  breakfast: ['food', 'meal', 'dinner', 'eat'],
  cook: ['food', 'meal', 'dinner', 'kitchen'],
  programming: ['code', 'language', 'software', 'developer', 'computer'],
  code: ['programming', 'language', 'software', 'developer'],
  developer: ['programming', 'code', 'software', 'engineer'],
  software: ['programming', 'code', 'developer', 'engineer'],
  engineer: ['developer', 'software', 'programming', 'robotics'],
  robotics: ['engineer', 'hardware', 'system', 'build'],
  project: ['build', 'develop', 'system', 'aegis', 'debug', 'create'],
  debug: ['fix', 'bug', 'test', 'code', 'project'],
  fix: ['debug', 'bug', 'repair', 'project'],
  bug: ['debug', 'fix', 'error', 'test'],
  build: ['project', 'create', 'develop', 'system'],
  create: ['build', 'project', 'develop'],
  develop: ['build', 'create', 'project', 'code'],
  aegis: ['project', 'memory', 'system', 'ai'],
  python: ['programming', 'language', 'code'],
  rust: ['programming', 'language', 'code'],
  java: ['programming', 'language', 'code'],
  language: ['programming', 'code', 'python', 'rust', 'java'],
  ai: ['aegis', 'intelligence', 'machine', 'system'],
  memory: ['aegis', 'system', 'remember'],
  remember: ['memory', 'recall'],
};

/*
 * Expand a token set with semantically related tokens.
 *
 * For each token in the input, look up RELATED_TOKENS and add any
 * related terms to the result. This lets a user message about
 * "dinner" match a memory stored under "food", even though the
 * words are lexically different.
 *
 * Returns a new Set; the input is not mutated.
 */
function expandTokens(tokens) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    const related = RELATED_TOKENS[token];
    if (related) {
      for (const term of related) {
        expanded.add(term);
      }
    }
  }

  return expanded;
}

/**
 * Tokenize text into a Set of meaningful lowercase words.
 *
 * - Lowercases input
 * - Extracts alphabetic tokens (2+ chars)
 * - Filters out common stop words
 * - Returns empty Set for null/empty input
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') {
    return new Set();
  }

  const tokens = new Set();
  const words = text.toLowerCase().match(/[a-z]{2,}/g) || [];

  for (const word of words) {
    if (!STOP_WORDS.has(word)) {
      tokens.add(word);
    }
  }

  return tokens;
}

/**
 * Compute a Dice coefficient between two token sets.
 *
 * Dice = 2 * |intersection| / (|setA| + |setB|)
 *
 * Returns 0 when either set is empty.
 */
function diceCoefficient(tokensA, tokensB) {
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionSize++;
    }
  }

  return (2 * intersectionSize) / (tokensA.size + tokensB.size);
}

/**
 * Compute a relevance score for a single memory against the user's message.
 *
 * Weighted model:
 *   text relevance: 0.45
 *   importance:    0.25
 *   confidence:    0.15
 *   recency:       0.15
 *
 * Returns a number in roughly [0, 1].
 */
function computeRelevanceScore(memory, userMessageTokens) {
  // 1. Importance (normalize 1-10 to 0-1)
  const importance = typeof memory.importance === 'number'
    ? memory.importance
    : 5;
  const importanceScore = Math.min(1, Math.max(0, importance / 10));

  // 2. Confidence (already 0-1)
  const confidence = typeof memory.confidence === 'number'
    ? Number(memory.confidence)
    : 0.8;
  const confidenceScore = Math.min(1, Math.max(0, confidence));

  // 3. Recency (exponential decay over 30 days)
  const referenceDate = memory.last_accessed_at || memory.updated_at;
  let recencyScore = 0.5; // neutral default for unknown dates
  if (referenceDate) {
    const refTime = new Date(referenceDate).getTime();
    if (!isNaN(refTime)) {
      const daysOld = (Date.now() - refTime) / (1000 * 60 * 60 * 24);
      // Future dates (clock skew) get full recency
      recencyScore = Math.exp(-Math.max(0, daysOld) / 30);
    }
  }

  // 4. Text relevance (Dice coefficient over key, value, category)
  const textRelevance = computeTextRelevance(memory, userMessageTokens);

  return (
    textRelevance * 0.45 +
    importanceScore * 0.25 +
    confidenceScore * 0.15 +
    recencyScore * 0.15
  );
}

/**
 * Compute text relevance between a memory and the user's tokens.
 *
 * Uses a weighted Dice coefficient across memory_key, memory_value,
 * and category. The key gets the highest weight because it is the
 * most concise identifier of the memory's topic.
 */
function computeTextRelevance(memory, userMessageTokens) {
  if (userMessageTokens.size === 0) {
    return 0;
  }

  // Expand user tokens with semantically related terms so that
  // conceptually related memories can match even without shared words.
  const expandedUserTokens = expandTokens(userMessageTokens);

  const keyTokens = tokenize(memory.memory_key || '');
  const valueTokens = tokenize(memory.memory_value || '');
  const categoryTokens = tokenize(memory.memory_key + ' ' + (memory.category || ''));

  const keyDice = diceCoefficient(expandedUserTokens, keyTokens);
  const valueDice = diceCoefficient(expandedUserTokens, valueTokens);
  const categoryDice = diceCoefficient(expandedUserTokens, categoryTokens);

  // Weight: key is most important, then value, then category
  return keyDice * 0.5 + valueDice * 0.3 + categoryDice * 0.2;
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

/**
 * ADVISORY classifier system instruction.
 *
 * This prompt is used ONLY to label how a NEWLY extracted memory relates
 * to an EXISTING one that shares the same (category, memory_key) for the
 * same user. The model NEVER receives or supplies:
 *   - userId            (server owns it)
 *   - database id       (SERIAL, server-generated)
 *   - memory_key         (identity is fixed by the caller from the existing row)
 *   - source             (forced to 'conversation' by the server)
 *   - any SQL/write action (the server performs the write)
 *
 * The model may only return an action enum. Its verdict is advisory; the
 * server remains the single authority for identity, ownership, and writes.
 */
const MEMORY_CLASSIFY_SYSTEM_INSTRUCTION = `
You are an advisory memory-classification helper for a personal AI
assistant. You are given an EXISTING memory and a NEW memory that share
the SAME (category, memory_key) for the SAME user. The NEW memory_value
is a direct reflection of what the user just said. Your ONLY job is to
pick ONE action and return STRICT JSON:

{"action":"duplicate"}     - NEW value says the same thing as EXISTING
{"action":"update"}        - NEW value replaces/refines EXISTING without logical conflict
{"action":"contradiction"} - NEW value directly conflicts with / retracts EXISTING
{"action":"ignore"}        - you cannot decide reliably, or the value is not useful

Rules:
- A preference/life-fact change expressed as "I now prefer X" (replacing
  "I prefer Y") is a contradiction: the old fact is retracted.
- A version/description refinement (e.g. "Python 3.10" -> "Python 3.11") is an update.
- If the two values express the same fact in different words, it is a duplicate.
- Do NOT invent actions, ids, or operations. Do NOT touch any database.
- Output raw JSON only. No markdown. No explanations.
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
 * Normalize a memory value for stable equality comparison.
 *
 * Collapses whitespace and lower-cases so that "Python" and "python "
 * are treated as the same fact. Punctuation is intentionally preserved
 * ("C++" !== "c#" while "C++" === "c++").
 */
function normalizeMemoryValue(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Robustly extract the first JSON object/array from a raw model string.
 *
 * Mirrors parseMemoryExtractionOutput's fence/brace handling, but returns
 * the parsed object directly (the classifier returns {"action":"..."}
 * which is neither an array nor a {memories:[...]} shape).
 */
function safeParseJsonObject(rawText) {
  const text = String(rawText || '').trim();

  if (!text) {
    return null;
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
    return null;
  }

  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * ADVISORY classifier: decide how a newly extracted memory relates to an
 * existing one that shares the same (user_id, category, memory_key).
 *
 * Returns one of: 'update' | 'contradiction' | 'duplicate' | 'ignore'.
 *
 * SAFETY:
 * - The model ONLY receives the two values + their importance/confidence and
 *   returns an action enum. It never sees or sets:
 *     - userId            (server owns it)
 *     - database id       (SERIAL, server-generated)
 *     - memory_key        (identity fixed by the caller from the existing row)
 *     - source            (forced to 'conversation' by the server)
 *     - any SQL/write op   (the server performs the write)
 * - On ANY failure (no API key, model error, timeout, empty reply, parse
 *   failure, or an unsupported action) it returns 'ignore'. The caller
 *   then leaves the existing memory untouched — fail-safe by design.
 */
async function classifyMemoryAgainstExisting(existing, candidate) {
  if (!process.env.GEMINI_API_KEY) {
    return 'ignore';
  }

  const prompt = `
EXISTING MEMORY (already stored for this user):
category: ${String(existing.category || '')}
memory_key: ${String(existing.memory_key || '')}
memory_value: ${String(existing.memory_value || '')}
importance: ${existing.importance != null ? existing.importance : ''}
confidence: ${existing.confidence != null ? existing.confidence : ''}

NEW MEMORY (just extracted from the user's latest message):
category: ${String(candidate.category || '')}
memory_key: ${String(candidate.memoryKey || '')}
memory_value: ${String(candidate.memoryValue || '')}
importance: ${candidate.importance != null ? candidate.importance : ''}
confidence: ${candidate.confidence != null ? candidate.confidence : ''}

Both refer to the SAME (category, memory_key) for the SAME user. The NEW
memory_value is a direct quote of what the user just said.

Return STRICT JSON only:
{"action":"<one of duplicate|update|contradiction|ignore>"}
No markdown. No explanations.
`;

  let lastError = null;

  for (const modelName of MEMORY_EXTRACTION_MODELS) {
    let timeoutId = null;
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: MEMORY_CLASSIFY_SYSTEM_INSTRUCTION,
      });

      const classificationPromise = model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0,
        },
      });

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(
            `Memory classification timed out after ${MEMORY_EXTRACTION_TIMEOUT_MS}ms.`,
          );
          timeoutError.code = 'MEMORY_CLASSIFICATION_TIMEOUT';
          reject(timeoutError);
        }, MEMORY_EXTRACTION_TIMEOUT_MS);
      });

      let parsed = null;
      try {
        const result = await Promise.race([
          classificationPromise,
          timeoutPromise,
        ]);
        // Swallow any late model rejection so it cannot surface as an
        // unhandled rejection (matches generateMemoryExtraction).
        classificationPromise.catch(() => {});

        const text = String(result?.response?.text?.() || '').trim();
        if (!text) {
          throw new Error(
            `${modelName} returned an empty classification response.`,
          );
        }

        parsed = safeParseJsonObject(text);
        if (!parsed) {
          throw new Error(
            `${modelName} returned unparseable classification JSON.`,
          );
        }
      } catch (raceError) {
        classificationPromise.catch(() => {});
        throw raceError;
      } finally {
        clearTimeout(timeoutId);
      }

      const action = String(parsed.action || '').trim().toLowerCase();
      if (
        action === 'update' ||
        action === 'contradiction' ||
        action === 'duplicate' ||
        action === 'ignore'
      ) {
        return action;
      }

      // Unsupported action value -> fail safe.
      console.error(
        `[MEMORY] Unsupported classification action "${action}" from ${modelName}.`,
      );
      return 'ignore';
    } catch (modelError) {
      lastError = modelError;
      console.error(
        `[MEMORY] ⚠️ Classification model ${modelName} failed:`,
        modelError?.message || modelError,
      );
    }
  }

  // Every model failed / timed out -> fail safe (do not overwrite).
  if (lastError) {
    console.error(
      '[MEMORY] All classification models failed;'
        + ' existing memory left unchanged.',
      lastError?.message || lastError,
    );
  }
  return 'ignore';
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
      // Identity is the strict (user_id, category, memory_key) tuple
      // enforced by the DB UNIQUE constraint. We NEVER merge across
      // different keys — that is the hard safeguard against overwriting
      // an unrelated memory merely because the model guessed the two
      // facts were related.
      const existing = await memoryQueries.getByCategoryKey(
        userId,
        memoryCandidate.category,
        memoryCandidate.memoryKey,
      );

      // (B) No active, non-expired memory for this key -> create as NEW
      //     through the unchanged saveMemory() path.
      if (!existing) {
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
        continue;
      }

      // (C) Identical normalized value -> duplicate. Do nothing; never
      //     create a second row for the same (user_id, category, key).
      const normalizedExisting = normalizeMemoryValue(existing.memory_value);
      const normalizedCandidate = normalizeMemoryValue(
        memoryCandidate.memoryValue,
      );

      if (normalizedExisting === normalizedCandidate) {
        savedMemories.push(existing);
        continue;
      }

      // (D) Different value -> ADVISORY Gemini classification. The model
      //     may ONLY return an action enum; it can never own the userId,
      //     the database id, the memory_key identity, the source, or the
      //     write. The server remains the single authority. Anything that
      //     is not a clean, supported verdict fails safe to 'ignore'.
      let classification = 'ignore';
      try {
        classification = await classifyMemoryAgainstExisting(
          existing,
          memoryCandidate,
        );
      } catch (classifyError) {
        console.error(
          '[MEMORY] Classification step failed (fail-safe ignore):',
          classifyError?.message || classifyError,
        );
        classification = 'ignore';
      }

      if (
        classification === 'duplicate' ||
        classification === 'ignore'
      ) {
        if (classification === 'duplicate') {
          savedMemories.push(existing);
        }
        continue;
      }

      // (4) Server-side low-confidence safety gate. A trusted
      //     (confidence >= 0.90) memory must NOT be rewritten by a
      //     low-confidence (< 0.60) extraction — neither by "update"
      //     nor by "contradiction". The classifier can never bypass it.
      const existingConfidence = Number(existing.confidence);
      const incomingConfidence = Number(memoryCandidate.confidence);

      if (existingConfidence >= 0.90 && incomingConfidence < 0.60) {
        console.log(
          `[MEMORY] Trusted memory "${existing.memory_key}" ` +
            `(${existing.category}) NOT overwritten: existing confidence ` +
            `${existingConfidence} >= 0.90 and incoming ` +
            `${incomingConfidence} < 0.60 ` +
            `(classified as ${classification}).`,
        );
        savedMemories.push(existing);
        continue;
      }

      // (3) Apply update / contradiction write through the existing upsert.
      //     Both actions replace memory_value with the new explicit user
      //     statement. The upsert preserves created_at, access_count and
      //     last_accessed_at (those columns are NOT in DO UPDATE SET),
      //     sets is_active = TRUE and bumps updated_at to now.
      //
      // Confidence policy (approved):
      //   - "update"      -> confidence = max(existing, incoming)
      //                       A refinement/retraction that is NOT a logical
      //                       conflict should never lose trust.
      //   - "contradiction" -> confidence = incomingConfidence
      //                       The stored value is the NEW explicit user
      //                       statement, so the confidence stored should
      //                       reflect confidence IN THAT NEW VALUE, not the
      //                       old one. (Section 3 specified this.)
      //   The server-side safety gate above (existing >= 0.90 AND incoming
      //   < 0.60) still blocks the entire overwrite first; this policy only
      //   applies to writes that pass the gate.
      const newImportance = Math.max(
        typeof existing.importance === 'number'
          ? existing.importance
          : 5,
        memoryCandidate.importance,
      );
      const newConfidence =
        classification === 'update'
          ? Math.max(existingConfidence, incomingConfidence)
          : incomingConfidence;

      const updated = await memoryQueries.upsert({
        userId,
        category: memoryCandidate.category,
        memoryKey: memoryCandidate.memoryKey,
        memoryValue: memoryCandidate.memoryValue,
        importance: newImportance,
        confidence: newConfidence,
        source: 'conversation',
        expiresAt: null,
      });

      if (updated) {
        savedMemories.push(updated);
      }
    } catch (saveMemoryError) {
      console.error(
        '[MEMORY] Failed to process extracted memory:',
        saveMemoryError?.message || saveMemoryError,
      );
    }
  }

  if (savedMemories.length) {
    console.log(
      `[MEMORY] Saved ${savedMemories.length} memory/memories.`,
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