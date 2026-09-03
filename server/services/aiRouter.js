/**
 * AI Router - Routes requests to providers with fallback logic
 * Maintains the existing provider fallback order: Gemini → NVIDIA
 */

const { createProviders, getDefaultProviderOrder } = require('../providers');

class AIRouter {
  constructor() {
    this.providers = createProviders();
    this.providerOrder = getDefaultProviderOrder();
  }

  /**
   * Get available providers in priority order
   * @returns {Array} Array of provider instances
   */
  getAvailableProviders() {
    return this.providerOrder
      .filter(name => this.providers[name])
      .map(name => this.providers[name]);
  }

  /**
   * Generate a non-streaming response with provider fallback
   * @param {Array} messages - Messages in provider-agnostic format [{ role, content }]
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} { text, model, provider, rawResponse }
   */
  async generate(messages, options = {}) {
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      throw new Error('No AI providers available. Check API keys.');
    }

    let lastError;

    for (const provider of availableProviders) {
      try {
        console.log(`[AIRouter] Trying provider: ${provider.getName()}`);
        const result = await provider.generate(messages, options);
        
        if (result.text && result.text.length > 0) {
          console.log(`[AIRouter] ${provider.getName()} succeeded with model: ${result.model}`);
          return {
            ...result,
            provider: provider.getName()
          };
        }
      } catch (error) {
        console.warn(`[AIRouter] ${provider.getName()} failed:`, error?.message || error);
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error('All providers failed');
  }

  /**
   * Generate a streaming response with provider fallback
   * @param {Array} messages - Messages in provider-agnostic format [{ role, content }]
   * @param {Object} options - Generation options
   * @returns {AsyncGenerator<Object>} Yields { content, done, model, provider }
   */
  async *stream(messages, options = {}) {
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      throw new Error('No AI providers available. Check API keys.');
    }

    let lastError;

    for (const provider of availableProviders) {
      try {
        console.log(`[AIRouter] Streaming with provider: ${provider.getName()}`);
        
        let hasContent = false;
        let fullText = '';
        let modelName = null;

        for await (const chunk of provider.stream(messages, options)) {
          hasContent = true;
          modelName = chunk.model;
          fullText += chunk.content || '';
          
          yield {
            content: chunk.content,
            done: chunk.done,
            model: chunk.model,
            provider: provider.getName()
          };

          if (chunk.done) {
            console.log(`[AIRouter] ${provider.getName()} streaming succeeded with model: ${modelName}`);
            return; // Success - exit the generator
          }
        }

        if (hasContent && fullText.trim().length > 0) {
          return; // Success
        }
      } catch (error) {
        console.warn(`[AIRouter] ${provider.getName()} streaming failed:`, error?.message || error);
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error('All providers failed for streaming');
  }

  /**
   * Get all available models across all providers
   * @returns {Object} Map of provider -> models
   */
  getAllModels() {
    const models = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      models[name] = provider.getModels();
    }
    return models;
  }

  /**
   * Check if any provider is available
   * @returns {boolean}
   */
  hasProviders() {
    return Object.keys(this.providers).length > 0;
  }
}

// Export singleton instance
const aiRouter = new AIRouter();

module.exports = {
  AIRouter,
  aiRouter
};