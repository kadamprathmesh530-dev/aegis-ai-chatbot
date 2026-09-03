/**
 * BaseProvider - Abstract base class for AI providers
 * Defines the common interface all providers must implement
 */

class BaseProvider {
  /**
   * Get the provider name
   * @returns {string} Provider identifier
   */
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }

  /**
   * Get available models for this provider
   * @returns {string[]} Array of model identifiers
   */
  getModels() {
    throw new Error('getModels() must be implemented by subclass');
  }

  /**
   * Generate a non-streaming response
   * @param {Array} messages - Array of message objects in provider-specific format
   * @param {Object} options - Generation options (temperature, maxTokens, etc.)
   * @returns {Promise<Object>} Response object with { text, model, rawResponse }
   */
  async generate(messages, options = {}) {
    throw new Error('generate() must be implemented by subclass');
  }

  /**
   * Generate a streaming response
   * @param {Array} messages - Array of message objects in provider-specific format
   * @param {Object} options - Generation options (temperature, maxTokens, etc.)
   * @returns {AsyncGenerator<Object>} Async generator yielding { content, done } chunks
   */
  async *stream(messages, options = {}) {
    throw new Error('stream() must be implemented by subclass');
  }
}

module.exports = BaseProvider;