/**
 * NVIDIA Provider - History Adapter
 * Converts Aegis conversation messages to/from OpenAI/NVIDIA format
 */

/**
 * Convert Aegis messages to OpenAI/NVIDIA format
 * Aegis format: [{ role: 'user'|'assistant', content: string, ... }]
 * OpenAI format: [{ role: 'user'|'assistant'|'system', content: string }]
 * 
 * @param {Array} aegisMessages - Array of Aegis message objects
 * @returns {Array} Array of OpenAI format messages
 */
function toOpenAIHistory(aegisMessages) {
  if (!Array.isArray(aegisMessages)) return [];

  return aegisMessages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content || ''
  }));
}

/**
 * Convert OpenAI/NVIDIA response to Aegis format
 * @param {Object} openAIResponse - Raw OpenAI response
 * @returns {Object} Normalized response { text, model, rawResponse }
 */
function fromOpenAIResponse(openAIResponse, model) {
  const content = openAIResponse.choices?.[0]?.message?.content || '';
  return {
    text: content.trim(),
    model,
    rawResponse: openAIResponse
  };
}

/**
 * Convert streaming chunk to normalized format
 * @param {Object} chunk - Raw OpenAI stream chunk
 * @returns {Object} Normalized chunk { content, done }
 */
function fromOpenAIStreamChunk(chunk) {
  const content = chunk.choices?.[0]?.delta?.content || '';
  return {
    content,
    done: false
  };
}

module.exports = {
  toOpenAIHistory,
  fromOpenAIResponse,
  fromOpenAIStreamChunk
};