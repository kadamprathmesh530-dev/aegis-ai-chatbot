const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { conversationQueries, messageQueries } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

router.use(authenticateToken);

/**
 * Helper: Smart fallback response generator when no Gemini API key is configured
 */
function generateFallbackResponse(userPrompt, conversationHistory = []) {
  const promptLower = userPrompt.toLowerCase().trim();

  if (promptLower.includes('hello') || promptLower.includes('hi') || promptLower.includes('hey')) {
    return `Hello! 👋 I am your secure AI Assistant. I am ready to help you with coding, answering questions, brainstorming ideas, analyzing data, and more.\n\n*Note: To connect to live Google Gemini models, you can add your \`GEMINI_API_KEY\` to the \`.env\` file.*`;
  }

  if (promptLower.includes('who are you') || promptLower.includes('what can you do')) {
    return `I am an AI Chatbot Assistant running on a secure full-stack architecture with:\n\n- **🔐 Authentication & RBAC**: Safe password hashing (bcrypt) and JWT session tokens\n- **🗄️ Database**: SQLite with user isolation and message persistence\n- **👑 Admin Portal**: Multi-user analytics and conversation oversight\n- **⚡ Google Gemini Integration**: Ready for Gemini 1.5/2.0 models\n\nHow can I help you today?`;
  }

  if (promptLower.includes('code') || promptLower.includes('javascript') || promptLower.includes('python')) {
    return `Here is a clean code example based on your request:\n\n\`\`\`javascript\n// Secure verification pattern\nasync function authenticate(credentials) {\n  const user = await findUserByEmail(credentials.email);\n  if (!user) return null;\n  \n  const isValid = await bcrypt.compare(credentials.password, user.passwordHash);\n  return isValid ? user : null;\n}\n\`\`\`\n\nLet me know if you need modifications or other language examples!`;
  }

  return `Thank you for your message! 🤖\n\n> "${userPrompt}"\n\nI have securely processed your prompt. Your conversation is saved to the SQLite database and linked exclusively to your user account.\n\n**`;
}

/**
 * POST /api/chat
 * Send a message, get AI response, and persist exchange in database
 */
router.post('/', async (req, res) => {
  try {
    let { conversationId, message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required.'
      });
    }

    const cleanMessage = message.trim();

    // Verify or create conversation
    let isNewConversation = false;
    if (!conversationId) {
      conversationId = uuidv4();
      const initialTitle = cleanMessage.length > 40 ? `${cleanMessage.substring(0, 40)}...` : cleanMessage;
      conversationQueries.create.run(conversationId, req.user.id, initialTitle);
      isNewConversation = true;
    } else {
      const existingConv = conversationQueries.getByIdAndUser.get(conversationId, req.user.id);
      if (!existingConv) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found or access denied.'
        });
      }
    }

    // 1. Save user's message to database
    const userMsgResult = messageQueries.add.run(conversationId, 'user', cleanMessage);
    conversationQueries.touchUpdatedAt.run(conversationId);

    // 2. Fetch recent conversation context for model
    const recentMessages = messageQueries.getRecentContext.all(conversationId, 10).reverse();

    // 3. Generate AI Response
    let assistantResponseText = '';
    const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

        // Format history for Gemini: must start with user and strictly alternate
        const historyForGemini = [];
        let expectedRole = 'user';
        for (const m of recentMessages.slice(0, -1)) {
          const role = m.role === 'assistant' ? 'model' : 'user';
          if (role === expectedRole) {
            historyForGemini.push({
              role,
              parts: [{ text: m.content }]
            });
            expectedRole = expectedRole === 'user' ? 'model' : 'user';
          }
        }

        const chatSession = model.startChat({
          history: historyForGemini,
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7,
          }
        });

        const result = await chatSession.sendMessage(cleanMessage);
        const response = await result.response;
        assistantResponseText = response.text();
      } catch (aiErr) {
        console.warn('[AI] Gemini API call error, falling back to local assistant:', aiErr.message);
        assistantResponseText = generateFallbackResponse(cleanMessage, recentMessages);
      }
    } else {
      // Offline fallback mode
      assistantResponseText = generateFallbackResponse(cleanMessage, recentMessages);
    }

    // 4. Save assistant response to database
    const assistantMsgResult = messageQueries.add.run(conversationId, 'assistant', assistantResponseText);
    conversationQueries.touchUpdatedAt.run(conversationId);

    // 5. Auto-update title if it's the first exchange and title is default
    let updatedTitle = null;
    const currentConv = conversationQueries.getByIdAndUser.get(conversationId, req.user.id);
    if (currentConv && (currentConv.title === 'New Conversation' || isNewConversation)) {
      const generatedTitle = cleanMessage.length > 40 ? `${cleanMessage.substring(0, 40)}...` : cleanMessage;
      conversationQueries.updateTitle.run(generatedTitle, conversationId, req.user.id);
      updatedTitle = generatedTitle;
    }

    return res.json({
      success: true,
      conversationId,
      updatedTitle,
      userMessage: {
        id: userMsgResult.lastInsertRowid,
        conversation_id: conversationId,
        role: 'user',
        content: cleanMessage,
        created_at: new Date().toISOString()
      },
      assistantMessage: {
        id: assistantMsgResult.lastInsertRowid,
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantResponseText,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    return res.status(500).json({
      success: false,
      error: 'An error occurred while processing your message.'
    });
  }
});

module.exports = router;

