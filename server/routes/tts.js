const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Protect TTS endpoint from excessive requests
const ttsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many voice requests. Please try again later.'
  }
});

router.use(ttsLimiter);

/*
  ElevenLabs Natural Voice API

  Required Render Environment Variables:

  ELEVENLABS_API_KEY
  ELEVENLABS_VOICE_ID

  Optional:

  ELEVENLABS_MODEL_ID
  Default: eleven_multilingual_v2
*/

router.post('/', async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    const modelId =
      process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

    // Check API key
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key is not configured on the server.'
      });
    }

    // Check Voice ID
    if (!voiceId) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs voice ID is not configured on the server.'
      });
    }

    // Get text from request
    const text =
      typeof req.body?.text === 'string'
        ? req.body.text.trim()
        : '';

    // Empty text check
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required.'
      });
    }

    // Prevent very large requests
    if (text.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Text is too long for one voice request.'
      });
    }

    // Call ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        voiceId
      )}`,
      {
        method: 'POST',

        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },

        body: JSON.stringify({
          text,
          model_id: modelId,

          voice_settings: {
            stability: 0.42,
            similarity_boost: 0.78,
            style: 0.55,
            use_speaker_boost: true
          }
        })
      }
    );

    // ElevenLabs error
    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        'ElevenLabs TTS error:',
        response.status,
        errorText
      );

      return res.status(
        response.status >= 400 && response.status < 500
          ? 400
          : 502
      ).json({
        success: false,
        error: 'ElevenLabs voice generation failed.'
      });
    }

    // Convert audio to Base64
    const audioBuffer = Buffer.from(
      await response.arrayBuffer()
    );

    return res.json({
      success: true,
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/mpeg'
    });

  } catch (error) {
    console.error('TTS route error:', error);

    return res.status(500).json({
      success: false,
      error: 'Could not generate voice audio.'
    });
  }
});

module.exports = router;