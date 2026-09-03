/**
 * Gemini Provider - Implementation
 * Extracted from server/routes/chat.js generateWithRetry and streamWithRetry
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const BaseProvider = require('../base/BaseProvider');
const { MODELS, DEFAULT_GENERATION_CONFIG, AEGIS_SYSTEM_INSTRUCTION } = require('./models');
const { toGeminiHistory, fromGeminiResponse, fromGeminiStreamChunk } = require('./historyAdapter');

class GeminiProvider extends BaseProvider {
  constructor(apiKey) {
    super();
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.apiKey = apiKey;
  }

  getName() {
    return 'gemini';
  }

  getModels() {
    return [...MODELS];
  }

  /**
   * Generate a non-streaming response with model fallback
   * @param {Array} messages - Messages in provider-agnostic format [{ role, content }]
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} { text, model, rawResponse }
   */
  async generate(messages, options = {}) {
    const { systemInstruction = AEGIS_SYSTEM_INSTRUCTION, ...genOptions } = options;
    const generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...genOptions };

    // Convert messages to Gemini history format
    // Last message is the current user message, rest is history
    const history = toGeminiHistory(messages.slice(0, -1));
    const currentMessage = messages[messages.length - 1]?.content || '';

    let lastError;

    for (const modelName of MODELS) {
      try {
        console.log(`[GeminiProvider] Trying model: ${modelName}`);

        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
          generationConfig
        });

        const chatSession = model.startChat({ history });
        const result = await chatSession.sendMessage(currentMessage);
        const response = await result.response;

        const normalized = fromGeminiResponse(response, modelName);
        
        if (normalized.text && normalized.text.length > 0) {
          console.log(`[GeminiProvider] ${modelName} succeeded.`);
          return normalized;
        }
      } catch (error) {
        console.warn(`[GeminiProvider] ${modelName} failed:`, error?.message || error);
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error('All Gemini models failed');
  }

  /**
   * Generate a streaming response with model fallback
   * @param {Array} messages - Messages in provider-agnostic format [{ role, content }]
   * @param {Object} options - Generation options
   * @returns {AsyncGenerator<Object>} Yields { content, done, model }
   */
  async *stream(messages, options = {}) {
    const { systemInstruction = AEGIS_SYSTEM_INSTRUCTION, ...genOptions } = options;
    const generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...genOptions };

    // Convert messages to Gemini history format
    const history = toGeminiHistory(messages.slice(0, -1));
    const currentMessage = messages[messages.length - 1]?.content || '';

    let lastError;

    for (const modelName of MODELS) {
      try {
        console.log(`[GeminiProvider] Streaming with model: ${modelName}`);

        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
          generationConfig
        });

        const chatSession = model.startChat({ history });
        const result = await chatSession.sendMessageStream(currentMessage);

        let fullText = '';
        let hasContent = false;

        for await (const chunk of result.stream) {
          const normalized = fromGeminiStreamChunk(chunk);
          if (normalized.content) {
            fullText += normalized.content;
            hasContent = true;
            yield { content: normalized.content, done: false, model: modelName };
          }
        }

        if (hasContent && fullText.trim().length > 0) {
          console.log(`[GeminiProvider] ${modelName} streaming succeeded.`);
          yield { content: '', done: true, model: modelName, fullText: fullText.trim() };
          return;
        }
      } catch (error) {
        console.warn(`[GeminiProvider] ${modelName} streaming failed:`, error?.message || error);
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error('All Gemini models failed for streaming');
  }
}

module.exports = GeminiProvider;