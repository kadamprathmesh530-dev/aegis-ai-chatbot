/**
 * Gemini Provider - History Adapter
 * Converts Aegis conversation messages to/from Gemini format
 */

/**
 * Convert Aegis messages to Gemini history format
 * Aegis format: [{ role: 'user'|'assistant', content: string, ... }]
 * Gemini format: [{ role: 'user'|'model', parts: [{ text: string }] }]
 * 
 * @param {Array} aegisMessages - Array of Aegis message objects
 * @returns {Array} Array of Gemini history objects
 */
function toGeminiHistory(aegisMessages) {
  if (!Array.isArray(aegisMessages)) return [];

  const history = [];
  let expectedRole = 'user';

  for (const msg of aegisMessages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';

    // Only add if role matches expected (alternating user/model)
    if (role === expectedRole) {
      history.push({
        role,
        parts: [{ text: msg.content || '' }]
      });
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }

  return history;
}

/**
 * Convert Gemini response to Aegis format
 * @param {Object} geminiResponse - Raw Gemini response
 * @returns {Object} Normalized response { text, model, rawResponse }
 */
function fromGeminiResponse(geminiResponse, model) {
  const text = geminiResponse.text?.() || '';
  return {
    text: text.trim(),
    model,
    rawResponse: geminiResponse
  };
}

/**
 * Convert streaming chunk to normalized format
 * @param {Object} chunk - Raw Gemini stream chunk
 * @returns {Object} Normalized chunk { content, done }
 */
function fromGeminiStreamChunk(chunk) {
  const text = chunk.text?.() || '';
  return {
    content: text,
    done: false
  };
}

module.exports = {
  toGeminiHistory,
  fromGeminiResponse,
  fromGeminiStreamChunk
};