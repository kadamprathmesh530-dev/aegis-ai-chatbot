/**
 * Provider Registry - Factory and registry for AI providers
 * Loads and configures providers based on available API keys
 */

const GeminiProvider = require('./gemini');
const NVIDIAProvider = require('./nvidia');

/**
 * Create and return configured provider instances
 * @returns {Object} Map of provider name -> provider instance
 */
function createProviders() {
  const providers = {};

  // Gemini (required - primary provider)
  if (process.env.GEMINI_API_KEY) {
    try {
      providers.gemini = new GeminiProvider(process.env.GEMINI_API_KEY);
      console.log('[ProviderRegistry] Gemini provider initialized');
    } catch (error) {
      console.error('[ProviderRegistry] Failed to initialize Gemini provider:', error.message);
    }
  } else {
    console.warn('[ProviderRegistry] GEMINI_API_KEY not set - Gemini provider unavailable');
  }

  // NVIDIA (optional - fallback provider)
  if (process.env.NVIDIA_API_KEY) {
    try {
      providers.nvidia = new NVIDIAProvider(process.env.NVIDIA_API_KEY);
      console.log('[ProviderRegistry] NVIDIA provider initialized');
    } catch (error) {
      console.error('[ProviderRegistry] Failed to initialize NVIDIA provider:', error.message);
    }
  } else {
    console.log('[ProviderRegistry] NVIDIA_API_KEY not set - NVIDIA provider unavailable (optional)');
  }

  return providers;
}

/**
 * Get the default provider priority order
 * @returns {string[]} Array of provider names in priority order
 */
function getDefaultProviderOrder() {
  return ['gemini', 'nvidia'];
}

/**
 * Get available provider names
 * @param {Object} providers - Provider instances map
 * @returns {string[]} Array of available provider names
 */
function getAvailableProviders(providers) {
  return Object.keys(providers);
}

module.exports = {
  createProviders,
  getDefaultProviderOrder,
  getAvailableProviders
};