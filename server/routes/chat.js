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
 * ============================================================
 * AEGIS AI SYSTEM IDENTITY
 * ============================================================
 */

const AEGIS_SYSTEM_INSTRUCTION = `
You are Aegis AI, a helpful, intelligent, friendly and accurate AI assistant.

Your name is Aegis AI.

You were created and developed by Prathmesh Kadam.

IMPORTANT IDENTITY RULES:

If the user asks:
- Who created you?
- Who developed you?
- Who made you?
- Who is your developer?
- Who is your creator?
- Who built you?
- Who designed you?
- Who programmed you?
- Who is behind you?
- Who owns/developed Aegis AI?

Clearly answer:
"I was created and developed by Prathmesh Kadam."

If the user asks "Who are you?", answer:
"I am Aegis AI, an AI assistant created and developed by Prathmesh Kadam."

If the user asks what model powers you, you may explain that you are powered by Google's Gemini model through the Gemini API.

Do not introduce yourself as Gemini when the user simply asks who you are.

You are Aegis AI, not Gemini.

Be helpful, accurate, friendly, and concise.
`;


/**
 * ============================================================
 * FALLBACK RESPONSE
 * ============================================================
 *
 * Used when:
 * 1. Gemini API key is missing
 * 2. Gemini API request fails
 *
 * This fallback must still behave like Aegis AI.
 */

function generateFallbackResponse(userPrompt, conversationHistory = []) {
  const promptLower = userPrompt.toLowerCase().trim();

  // ----------------------------------------------------------
  // Identity / Developer questions
  // ----------------------------------------------------------

  const developerQuestion =
    /\b(who\s+(created|developed|made|built|designed|programmed)\s+(you|aegis))\b/i.test(
      promptLower
    ) ||
    /\b(who\s+is\s+(your|the)\s+(developer|creator|maker|programmer))\b/i.test(
      promptLower
    ) ||
    promptLower.includes('who developed you') ||
    promptLower.includes('who created you') ||
    promptLower.includes('who made you') ||
    promptLower.includes('who built you') ||
    promptLower.includes('who is your developer') ||
    promptLower.includes('who is your creator');

  if (developerQuestion) {
    return `I was created and developed by Prathmesh Kadam.`;
  }

  // ----------------------------------------------------------
  // Who are you?
  // ----------------------------------------------------------

  if (
    promptLower.includes('who are you') ||
    promptLower.includes('what are you') ||
    promptLower.includes('introduce yourself')
  ) {
    return `I am Aegis AI, an AI assistant created and developed by Prathmesh Kadam.

I can help you with coding, programming, mathematics, technical questions, explanations, brainstorming, and many other tasks.`;
  }

  // ----------------------------------------------------------
  // Greeting
  // ----------------------------------------------------------

  if (
    /^(hello|hi|hey|hii|helo|good morning|good afternoon|good evening)[!.,\s]*$/i.test(
      promptLower
    )
  ) {
    return `Hello! 👋

I am Aegis AI, an AI assistant created and developed by Prathmesh Kadam.

How can I help you today?`;
  }

  // ----------------------------------------------------------
  // What is Python?
  // ----------------------------------------------------------

  if (
    promptLower === 'what is python' ||
    promptLower === 'what is python?' ||
    promptLower.includes('what is python language') ||
    promptLower.includes('define python')
  ) {
    return `## What is Python? 🐍

Python is a **high-level, interpreted, general-purpose programming language** known for its simple and readable syntax.

### Main features of Python:
- Easy to learn and use
- Simple and readable syntax
- Interpreted language
- Object-oriented programming support
- Large collection of libraries
- Cross-platform
- Used in AI, Machine Learning, Data Science, Web Development, Automation, and more

### Simple example:

\`\`\`python
print("Hello, World!")
\`\`\`

This program displays:

\`\`\`
Hello, World!
\`\`\`

Python is especially popular for beginners because its syntax is relatively easy to understand.`;
  }

  // ----------------------------------------------------------
  // Python programming questions
  // ----------------------------------------------------------

  if (
    promptLower.includes('python') &&
    (
      promptLower.includes('program') ||
      promptLower.includes('code') ||
      promptLower.includes('example') ||
      promptLower.includes('syntax')
    )
  ) {
    return `Sure! 🐍

Here is a simple Python example:

\`\`\`python
name = "Prathmesh"
print("Hello", name)
\`\`\`

Output:

\`\`\`
Hello Prathmesh
\`\`\`

If you give me the exact Python problem, I can explain and solve it step by step.`;
  }

  // ----------------------------------------------------------
  // JavaScript questions
  // ----------------------------------------------------------

  if (
    promptLower.includes('javascript') ||
    promptLower.includes('js code')
  ) {
    return `Here is a simple JavaScript example:

\`\`\`javascript
const name = "Prathmesh";

console.log("Hello " + name);
\`\`\`

Output:

\`\`\`
Hello Prathmesh
\`\`\``;
  }

  // ----------------------------------------------------------
  // General coding question
  // ----------------------------------------------------------

  if (
    promptLower.includes('code') ||
    promptLower.includes('programming')
  ) {
    return `Sure! 💻

Please tell me:
1. Which programming language you want
2. What you want the program to do

For example:

\`\`\`
Write a Python program to find the largest of three numbers.
\`\`\`

I'll provide the code and explain the logic.`;
  }

  // ----------------------------------------------------------
  // Default fallback
  // ----------------------------------------------------------

  return `Thank you for your message! 🤖

I am Aegis AI, created and developed by Prathmesh Kadam.

Your message has been securely processed and your conversation is saved to your account.

If you want, ask me a question and I'll help you with it.`;
}


/**
 * ============================================================
 * POST /api/chat
 * ============================================================
 *
 * Send a message, get AI response,
 * and persist exchange in PostgreSQL.
 */

router.post('/', async (req, res) => {
  try {
    let { conversationId, message } = req.body;

    // ----------------------------------------------------------
    // Validate message
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // 1. Verify or create conversation
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // 2. Save user's message
    // ----------------------------------------------------------

    const userMsgResult = await messageQueries.add(
      conversationId,
      'user',
      cleanMessage
    );

    await conversationQueries.touchUpdatedAt(
      conversationId
    );

    // ----------------------------------------------------------
    // 3. Get recent conversation context
    // ----------------------------------------------------------

    const recentMessages = (
      await messageQueries.getRecentContext(
        conversationId,
        20
      )
    ).reverse();

    // ----------------------------------------------------------
    // 4. Generate AI response
    // ----------------------------------------------------------

    let assistantResponseText = '';

    const geminiApiKey =
      (process.env.GEMINI_API_KEY || '').trim();

    if (geminiApiKey) {
      try {
        const genAI =
          new GoogleGenerativeAI(geminiApiKey);

        const model =
          genAI.getGenerativeModel({
            model: 'gemini-3.5-flash-lite',

            systemInstruction:
              AEGIS_SYSTEM_INSTRUCTION
          });

        // ------------------------------------------------------
        // Build Gemini conversation history
        // ------------------------------------------------------

        const historyForGemini = [];

        let expectedRole = 'user';

        for (const m of recentMessages.slice(0, -1)) {
          const role =
            m.role === 'assistant'
              ? 'model'
              : 'user';

          // Gemini requires alternating user/model history.
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

        // ------------------------------------------------------
        // Start Gemini chat session
        // ------------------------------------------------------

        const chatSession =
          model.startChat({
            history: historyForGemini,

            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.7
            }
          });

        // ------------------------------------------------------
        // Send current user message
        // ------------------------------------------------------

        const result =
          await chatSession.sendMessage(
            cleanMessage
          );

        const response =
          await result.response;

        assistantResponseText =
          response.text();

        // Safety check
        if (
          !assistantResponseText ||
          assistantResponseText.trim().length === 0
        ) {
          throw new Error(
            'Gemini returned an empty response.'
          );
        }

      } catch (aiErr) {
        console.warn(
          '[AI] Gemini API call error, using Aegis fallback:',
          aiErr.message
        );

        assistantResponseText =
          generateFallbackResponse(
            cleanMessage,
            recentMessages
          );
      }

    } else {
      // --------------------------------------------------------
      // Gemini API key not configured
      // --------------------------------------------------------

      console.warn(
        '[AI] GEMINI_API_KEY is not configured. Using fallback.'
      );

      assistantResponseText =
        generateFallbackResponse(
          cleanMessage,
          recentMessages
        );
    }

    // ----------------------------------------------------------
    // 5. Save assistant response
    // ----------------------------------------------------------

    const assistantMsgResult =
      await messageQueries.add(
        conversationId,
        'assistant',
        assistantResponseText
      );

    await conversationQueries.touchUpdatedAt(
      conversationId
    );

    // ----------------------------------------------------------
    // 6. Auto-update conversation title
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // 7. Send response to frontend
    // ----------------------------------------------------------

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