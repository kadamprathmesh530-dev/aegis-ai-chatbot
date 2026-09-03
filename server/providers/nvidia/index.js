/**
 * NVIDIA Provider - Implementation
 * Extracted from server/routes/chat.js NVIDIA fallback logic
 */

const OpenAI = require('openai');
const BaseProvider = require('../base/BaseProvider');
const { MODELS, DEFAULT_GENERATION_CONFIG, AEGIS_SYSTEM_INSTRUCTION } = require('./models');
const { toOpenAIHistory, fromOpenAIResponse, fromOpenAIStreamChunk } = require('./historyAdapter');

class NVIDIAProvider extends BaseProvider {
  constructor(apiKey) {
    super();
    if (!apiKey) {
      throw new Error('NVIDIA API key is required');
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1'
    });
    this.apiKey = apiKey;
  }

  getName() {
    return 'nvidia';
  }

  getModels() {
    return [...MODELS];
  }

  /**
   * Generate a non-streaming response
   * @param {Array} messages - Messages in provider-agnostic format [{ role, content }]
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} { text, model, rawResponse }
   */
  async generate(messages, options = {}) {
    const { systemInstruction = AEGIS_SYSTEM_INSTRUCTION, ...genOptions } = options;
    const generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...genOptions };

    // Convert messages to OpenAI format
    // Last message is the current user message, rest is history
    const history = toOpenAIHistory(messages.slice(0, -1));
    const currentMessage = messages[messages.length - 1]?.content || '';

    // Build messages array with system instruction
    const openAIMessages = [
      { role: 'system', content: systemInstruction },
      ...history,
      { role: 'user', content: currentMessage }
    ];

    const modelName = MODELS[0]; // Only one model for NVIDIA

    try {
      console.log(`[NVIDIAProvider] Trying model: ${modelName}`);

      const completion = await this.client.chat.completions.create({
        model: modelName,
        messages: openAIMessages,
        ...generationConfig
      });

      const normalized = fromOpenAIResponse(completion, modelName);
      
      if (normalized.text && normalized.text.length > 0) {
        console.log(`[NVIDIAProvider] ${modelName} succeeded.`);
        return normalized;
      }
    } catch (error) {
      console.warn(`[NVIDIAProvider] ${modelName} failed:`, error?.message || error);
      throw error;
    }

    throw new Error('NVIDIA model returned empty response');
  }

  /**
   * Generate a streaming response
   * @param {Array} messages - Messages in provider-agnostic format [{ role, content }]
   * @param {Object} options - Generation options
   * @returns {AsyncGenerator<Object>} Yields { content, done, model }
   */
  async *stream(messages, options = {}) {
    const { systemInstruction = AEGIS_SYSTEM_INSTRUCTION, ...genOptions } = options;
    const generationConfig = { ...DEFAULT_GENERATION_CONFIG, ...genOptions };

    // Convert messages to OpenAI format
    const history = toOpenAIHistory(messages.slice(0, -1));
    const currentMessage = messages[messages.length - 1]?.content || '';

    // Build messages array with system instruction
    const openAIMessages = [
      { role: 'system', content: systemInstruction },
      ...history,
      { role: 'user', content: currentMessage }
    ];

    const modelName = MODELS[0]; // Only one model for NVIDIA

    try {
      console.log(`[NVIDIAProvider] Streaming with model: ${modelName}`);

      const stream = await this.client.chat.completions.create({
        model: modelName,
        messages: openAIMessages,
        ...generationConfig,
        stream: true
      });

      let fullText = '';
      let hasContent = false;

      for await (const chunk of stream) {
        const normalized = fromOpenAIStreamChunk(chunk);
        if (normalized.content) {
          fullText += normalized.content;
          hasContent = true;
          yield { content: normalized.content, done: false, model: modelName };
        }
      }

      if (hasContent && fullText.trim().length > 0) {
        console.log(`[NVIDIAProvider] ${modelName} streaming succeeded.`);
        yield { content: '', done: true, model: modelName, fullText: fullText.trim() };
        return;
      }
    } catch (error) {
      console.warn(`[NVIDIAProvider] ${modelName} streaming failed:`, error?.message || error);
      throw error;
    }

    throw new Error('NVIDIA streaming returned empty response');
  }
}

module.exports = NVIDIAProvider;