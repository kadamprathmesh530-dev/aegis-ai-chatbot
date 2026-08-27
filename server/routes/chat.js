const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const {
  conversationQueries,
  messageQueries
} = require('../db/database');

const { authenticateToken } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

router.use(authenticateToken);

/**
 * Helper: Smart fallback response generator
 * Used when Gemini API key is not configured
 * or Gemini API call fails.
 */
function generateFallbackResponse(userPrompt, conversationHistory = []) {
  const promptLower = userPrompt.toLowerCase().trim();

  if (
    promptLower.includes('hello') ||
    promptLower.includes('hi') ||
    promptLower.includes('hey')
  ) {
    return `Hello! 👋 I am your secure AI Assistant.

I am ready to help you with coding, answering questions, brainstorming ideas, analyzing data, and more.

*Note: To connect to live Google Gemini models, make sure your \`GEMINI_API_KEY\` is configured in the \`.env\` file.*`;
  }

  if (
    promptLower.includes('who are you') ||
    promptLower.includes('what can you do')
  ) {
    return `I am an AI Chatbot Assistant running on a secure full-stack architecture with:

- 🔐 Authentication & RBAC
- 🗄️ PostgreSQL database with user isolation
- 👑 Admin Portal
- ⚡ Google Gemini Integration
- 💬 Persistent conversations and messages

How can I help you today?`;
  }

  if (
    promptLower.includes('code') ||
    promptLower.includes('javascript') ||
    promptLower.includes('python')
  ) {
    return `Here is a clean JavaScript example:

\`\`\`javascript
async function authenticate(credentials) {
  const user = await findUserByEmail(credentials.email);

  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(
    credentials.password,
    user.passwordHash
  );

  return isValid ? user : null;
}
\`\`\`

Let me know if you need modifications or another language example!`;
  }

  return `Thank you for your message! 🤖

> "${userPrompt}"

I have securely processed your prompt and saved this conversation to your account.`;
}

/**
 * POST /api/chat
 * Send a message, get AI response,
 * and persist exchange in PostgreSQL database.
 */
router.post('/', async (req, res) => {
  try {
    let { conversationId, message } = req.body;

    // Validate message
    if (
      !message ||
      typeof message !== 'string' ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required.'
      });
    }

    const cleanMessage = message.trim();

    // --------------------------------------------------
    // 1. Verify or create conversation
    // --------------------------------------------------

    let isNewConversation = false;

    if (!conversationId) {
      conversationId = uuidv4();

      const initialTitle =
        cleanMessage.length > 40
          ? `${cleanMessage.substring(0, 40)}...`
          : cleanMessage;

      await conversationQueries.create(
        conversationId,
        req.user.id,
        initialTitle
      );

      isNewConversation = true;
    } else {
      const existingConv =
        await conversationQueries.getByIdAndUser(
          conversationId,
          req.user.id
        );

      if (!existingConv) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found or access denied.'
        });
      }
    }

    // --------------------------------------------------
    // 2. Save user's message
    // --------------------------------------------------

    const userMsgResult = await messageQueries.add(
      conversationId,
      'user',
      cleanMessage
    );

    await conversationQueries.touchUpdatedAt(
      conversationId
    );

    // --------------------------------------------------
    // 3. Get recent conversation context
    // --------------------------------------------------

    const recentMessages = (
      await messageQueries.getRecentContext(
        conversationId,
        10
      )
    ).reverse();

    // --------------------------------------------------
    // 4. Generate AI response
    // --------------------------------------------------

    let assistantResponseText = '';

    const geminiApiKey =
      (process.env.GEMINI_API_KEY || '').trim();

    if (geminiApiKey) {
      try {
        const genAI =
          new GoogleGenerativeAI(geminiApiKey);

        const model = genAI.getGenerativeModel({
          model: 'gemini-3.6-flash',
           systemInstruction: `
        You are Aegis AI, a helpful and intelligent AI assistant.

        Your name is Aegis AI.

        You were created and developed by Prathmesh Kadam.

        If someone asks "Who created you?", "Who developed you?",
        "Who made you?", or similar questions, clearly answer:
        "I was created and developed by Prathmesh Kadam."

        If someone asks "Who are you?", introduce yourself as:
        "I am Aegis AI, an AI assistant created and developed by Prathmesh Kadam."

        Never introduce yourself as Gemini unless the user specifically asks which underlying AI model powers you.

        Be helpful, accurate, friendly, and concise.
        `
        });

        // Gemini history must start with user
        // and alternate between user/model.
        const historyForGemini = [];

        let expectedRole = 'user';

        for (const m of recentMessages.slice(0, -1)) {
          const role =
            m.role === 'assistant'
              ? 'model'
              : 'user';

          if (role === expectedRole) {
            historyForGemini.push({
              role,
              parts: [
                {
                  text: m.content
                }
              ]
            });

            expectedRole =
              expectedRole === 'user'
                ? 'model'
                : 'user';
          }
        }

        const chatSession = model.startChat({
          history: historyForGemini,

          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7
          }
        });

        const result =
          await chatSession.sendMessage(
            cleanMessage
          );

        const response =
          await result.response;

        assistantResponseText =
          response.text();

      } catch (aiErr) {
        console.warn(
          '[AI] Gemini API call error, using fallback:',
          aiErr.message
        );

        assistantResponseText =
          generateFallbackResponse(
            cleanMessage,
            recentMessages
          );
      }

    } else {
      // Offline fallback mode
      assistantResponseText =
        generateFallbackResponse(
          cleanMessage,
          recentMessages
        );
    }

    // --------------------------------------------------
    // 5. Save assistant response
    // --------------------------------------------------

    const assistantMsgResult =
      await messageQueries.add(
        conversationId,
        'assistant',
        assistantResponseText
      );

    await conversationQueries.touchUpdatedAt(
      conversationId
    );

    // --------------------------------------------------
    // 6. Auto-update conversation title
    // --------------------------------------------------

    let updatedTitle = null;

    const currentConv =
      await conversationQueries.getByIdAndUser(
        conversationId,
        req.user.id
      );

    if (
      currentConv &&
      (
        currentConv.title === 'New Conversation' ||
        isNewConversation
      )
    ) {
      const generatedTitle =
        cleanMessage.length > 40
          ? `${cleanMessage.substring(0, 40)}...`
          : cleanMessage;

      await conversationQueries.updateTitle(
        generatedTitle,
        conversationId,
        req.user.id
      );

      updatedTitle = generatedTitle;
    }

    // --------------------------------------------------
    // 7. Send response
    // --------------------------------------------------

    return res.json({
      success: true,

      conversationId,

      updatedTitle,

      userMessage: {
        id: userMsgResult.id,
        conversation_id: conversationId,
        role: 'user',
        content: cleanMessage,
        created_at:
          userMsgResult.created_at ||
          new Date().toISOString()
      },

      assistantMessage: {
        id: assistantMsgResult.id,
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantResponseText,
        created_at:
          assistantMsgResult.created_at ||
          new Date().toISOString()
      }
    });

  } catch (err) {
    console.error(
      'Chat endpoint error:',
      err
    );

    return res.status(500).json({
      success: false,
      error:
        'An error occurred while processing your message.'
    });
  }
});

module.exports = router;