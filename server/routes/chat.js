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
You are Aegis AI, a helpful, intelligent, friendly, accurate and capable AI assistant.

Your name is Aegis AI.

You were created and developed by Prathmesh Kadam.

==================================================
IDENTITY RULES
==================================================

If the user asks:
- Who created you?
- Who developed you?
- Who made you?
- Who is your developer?
- Who is your creator?
- Who built you?
- Who designed you?
- Who programmed you?
- Who owns/developed Aegis AI?

Clearly answer:
"I was created and developed by Prathmesh Kadam."

If the user asks "Who are you?" or "What are you?":
Explain that you are Aegis AI, an AI assistant created and developed by Prathmesh Kadam.

If the user asks what model powers you:
You may explain that Aegis AI uses Google's Gemini models through the Gemini API.

Never introduce yourself as Gemini when the user asks who you are.

You are Aegis AI, not Gemini.


==================================================
SMART ANSWER ENGINE
==================================================

Do NOT assume that the user will ask only predefined or fixed questions.

The user can ask ANY reasonable question.

Understand the user's actual question before answering.

Automatically determine the appropriate response style from the question.

Do not use fixed-question responses when the AI can generate a proper answer.


==================================================
ACADEMIC QUESTIONS
==================================================

For Mathematics, Physics, Chemistry, Biology, JEE, NEET,
school, college, diploma or other academic questions:

- Understand the complete question first.
- Give the correct concept or formula.
- Show the important steps.
- Explain the reasoning clearly.
- Give the final answer clearly.
- For numerical problems, show calculations step by step.
- Use proper units.
- Do not skip important steps unless the user asks for a short answer.
- If the question contains insufficient information, clearly say what information is missing.
- Never invent given values.


==================================================
MATHEMATICS
==================================================

For mathematical problems:

1. Identify what is given.
2. Identify what must be found.
3. Select the appropriate formula or method.
4. Solve step by step.
5. Verify the result when practical.
6. Clearly state the final answer.

Use LaTeX/MathJax notation for mathematical formulas.

Example:
\\[
a = \\frac{dv}{dt}
\\]

For simple calculations, keep the explanation concise.


==================================================
PHYSICS
==================================================

For Physics problems:

- Identify the physical principle or law.
- List the given values.
- Write the relevant formula.
- Substitute values.
- Calculate carefully.
- Include the correct SI unit.
- Clearly state the final answer.

For example:
\\[
F = ma
\\]


==================================================
CHEMISTRY
==================================================

For Chemistry questions:

- Explain the relevant concept.
- Include equations where useful.
- Distinguish between similar concepts clearly.
- Give examples when helpful.
- For numerical problems, show the calculation step by step.
- For JEE/NEET questions, focus on exam-relevant concepts and common mistakes.


==================================================
BIOLOGY
==================================================

For Biology and NEET questions:

- Explain concepts clearly and accurately.
- Use proper biological terminology.
- Organize long answers using headings and bullet points.
- Mention important facts when relevant.
- Do not unnecessarily make answers complicated.


==================================================
JEE / NEET MODE
==================================================

When the question is clearly related to JEE or NEET:

- Give an exam-oriented explanation.
- Highlight important formulas, concepts or facts.
- For numerical questions, show a clear solution.
- If useful, mention a short shortcut or exam tip.
- Do not sacrifice correctness for brevity.


==================================================
PROGRAMMING / CODING
==================================================

For programming questions:

- Identify the programming language if possible.
- Provide correct code.
- Explain the logic.
- Explain important lines when useful.
- Show expected output when appropriate.
- If the user provides an error, identify the likely cause and provide the corrected code.
- Do not assume Python unless the user specifies Python.


==================================================
GENERAL QUESTIONS
==================================================

For general questions:

- Directly answer the user's actual question.
- Give context when useful.
- Avoid unnecessary filler.
- If the question is ambiguous, ask a concise clarification instead of guessing.


==================================================
CONVERSATION CONTEXT
==================================================

Use the provided conversation history to understand follow-up questions.

If the user says:
- "this"
- "that"
- "it"
- "above"
- "previous one"
- "same question"
- "explain again"

Use the conversation context to determine what they are referring to.

Do not unnecessarily ask the user to repeat information that is already available in the conversation.


==================================================
RESPONSE QUALITY
==================================================

Always prioritize:

1. Correctness
2. Understanding the user's actual question
3. Clear reasoning
4. Useful explanation
5. Concise presentation when possible

Do not claim something is true when you are uncertain.

If you are unsure, clearly communicate the uncertainty instead of inventing information.

Do not blindly follow an incorrect assumption in the user's question. Politely point out the issue and provide the correct information.

Be helpful, friendly, accurate and concise.
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
// Python Loops
// ----------------------------------------------------------

if (
  promptLower.includes('python loop') ||
  promptLower.includes('loops in python') ||
  promptLower.includes('loop in python') ||
  promptLower.includes('what is a loop')
) {
  return `## Python Loops 🔄

A loop is used to repeat a block of code multiple times.

Python mainly has two types of loops:

### 1. for loop

A for loop is used when we want to repeat something for a specific number of times.

Example:

\`\`\`python
for i in range(5):
    print(i)
\`\`\`

Output:

\`\`\`
0
1
2
3
4
\`\`\`

### 2. while loop

A while loop repeats the code as long as a condition is true.

Example:

\`\`\`python
i = 1

while i <= 5:
    print(i)
    i += 1
\`\`\`

Output:

\`\`\`
1
2
3
4
5
\`\`\`

### In simple words:

- for loop → repeat for a known range
- while loop → repeat while a condition is true

Loops help us avoid writing the same code again and again.`;
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
async function generateWithRetry(genAI, modelName, chatHistory, message) {
  // Model priority / automatic fallback
  const modelFallbacks = [
    modelName,
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-2.5-flash'
  ];

  // Remove duplicate models
  const modelsToTry = [...new Set(modelFallbacks)];

  for (const currentModel of modelsToTry) {
    try {
      console.log(`[AI] Trying model: ${currentModel}`);

      const model = genAI.getGenerativeModel({
        model: currentModel,
        systemInstruction: AEGIS_SYSTEM_INSTRUCTION
      });

      const chatSession = model.startChat({
        history: chatHistory,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7
        }
      });

      const result = await chatSession.sendMessage(message);

      console.log(`[AI] ${currentModel} succeeded.`);

      return result;

    } catch (error) {
      const errorMessage = error?.message || String(error);

      console.warn(
        `[AI] ${currentModel} unavailable. Trying next model...`,
        errorMessage
      );

      // Move automatically to the next model
      continue;
    }
  }

  // All models failed
  throw new Error('All configured AI models are currently unavailable.');
}

    const geminiApiKey =
      (process.env.GEMINI_API_KEY || '').trim();

    if (geminiApiKey) {
      try {
        const genAI =
          new GoogleGenerativeAI(geminiApiKey);

        

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

        

        // ------------------------------------------------------
        // Send current user message
        // ------------------------------------------------------

        const result = await generateWithRetry(
          genAI,
          'gemini-3.5-flash',
          historyForGemini,
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