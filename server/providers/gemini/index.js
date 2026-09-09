/**
 * Gemini Provider - Implementation
 * Aegis AI
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const BaseProvider = require('../base/BaseProvider');

const {
  MODELS,
  DEFAULT_GENERATION_CONFIG,
  AEGIS_SYSTEM_INSTRUCTION
} = require('./models');

const {
  toGeminiHistory,
  fromGeminiResponse,
  fromGeminiStreamChunk
} = require('./historyAdapter');

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
   * Non-streaming generation
   */
  async generate(messages, options = {}) {
    const {
      systemInstruction = AEGIS_SYSTEM_INSTRUCTION,
      ...genOptions
    } = options;

    const generationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...genOptions
    };

    const history = toGeminiHistory(messages.slice(0, -1));

    const currentMessage =
      messages[messages.length - 1]?.content || '';

    let lastError = null;

    for (const modelName of MODELS) {
      try {
        console.log(
          `[GeminiProvider] Trying model: ${modelName}`
        );

        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction
        });

        const chatSession = model.startChat({
          history,
          generationConfig
        });

        const result =
          await chatSession.sendMessage(currentMessage);

        const response = await result.response;

        const normalized =
          fromGeminiResponse(response, modelName);

        if (
          normalized.text &&
          normalized.text.trim().length > 0
        ) {
          console.log(
            `[GeminiProvider] ${modelName} succeeded.`
          );

          return normalized;
        }

        throw new Error(
          `${modelName} returned an empty response`
        );

      } catch (error) {
        lastError = error;

        console.warn(
          `[GeminiProvider] ${modelName} failed:`,
          error?.message || error
        );

        continue;
      }
    }

    throw (
      lastError ||
      new Error('All Gemini models failed')
    );
  }

  /**
   * Streaming generation
   */
  async *stream(messages, options = {}) {
    const {
      systemInstruction = AEGIS_SYSTEM_INSTRUCTION,
      ...genOptions
    } = options;

    const generationConfig = {
      ...DEFAULT_GENERATION_CONFIG,
      ...genOptions
    };

    const history =
      toGeminiHistory(messages.slice(0, -1));

    const currentMessage =
      messages[messages.length - 1]?.content || '';

    let lastError = null;

    for (const modelName of MODELS) {
      try {
        console.log(
          `[GeminiProvider] Streaming with model: ${modelName}`
        );

        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction
        });

        const chatSession = model.startChat({
          history,
          generationConfig
        });

        const result =
          await chatSession.sendMessageStream(
            currentMessage
          );

        let fullText = '';
        let hasContent = false;

        for await (const chunk of result.stream) {
          const normalized =
            fromGeminiStreamChunk(chunk);

          if (normalized.content) {
            fullText += normalized.content;
            hasContent = true;

            yield {
              content: normalized.content,
              done: false,
              model: modelName
            };
          }
        }

        if (
          hasContent &&
          fullText.trim().length > 0
        ) {
          console.log(
            `[GeminiProvider] ${modelName} streaming succeeded.`
          );

          yield {
            content: '',
            done: true,
            model: modelName,
            fullText: fullText.trim()
          };

          return;
        }

        throw new Error(
          `${modelName} streaming returned empty response`
        );

      } catch (error) {
        lastError = error;

        console.warn(
          `[GeminiProvider] ${modelName} streaming failed:`,
          error?.message || error
        );

        continue;
      }
    }

    throw (
      lastError ||
      new Error(
        'All Gemini models failed for streaming'
      )
    );
  }
}

module.exports = GeminiProvider;