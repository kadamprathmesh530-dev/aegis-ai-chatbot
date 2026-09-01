const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const {
  conversationQueries,
  messageQueries
} = require('../db/database');

const { authenticateToken } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const { tavily } = require('@tavily/core');

const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY
});

const webAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const nvidiaAI = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1'
});

async function testWebSearch(query) {
  const response = await webAI.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: query,
    config: {
      tools: [
        {
          googleSearch: {}
        }
      ]
    }
  });

  return response;
}

router.get('/test-web-search', async (req, res) => {
  try {
    const result = await testWebSearch(
      'What is the latest major news in India today?'
    );

    res.json({
      success: true,
      text: result.text
    });
  } catch (error) {
    console.error('[WEB SEARCH TEST ERROR]', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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
LANGUAGE & CONVERSATION STYLE
==================================================

IMPORTANT:

Always detect the language and writing style used by the
CURRENT user message before generating the response.

The CURRENT user message has the highest priority for
determining the response language.

Language rules:

- English user message → respond in English.
- Hindi user message → respond in Hindi.
- Marathi user message → respond in Marathi.
- Hinglish user message → respond in natural Hinglish.
- Hindi written using English letters → respond in Hinglish.
- Marathi written using English letters → respond in Marathi using English letters.
- Hindi + English mixed message → naturally match the same mixture.
- Marathi + English mixed message → naturally match the same mixture.
- Multiple languages → preserve the natural language mixture.
- If the user changes language, immediately change your response language.
- Do NOT always respond in English.
- Do NOT translate the user's message unless requested.
- Do NOT choose English as the default when the user is speaking Hindi,
  Marathi or Hinglish.
- Technical terms, programming keywords, API names and code may remain
  in English when appropriate.
- Normal explanations and conversation should follow the user's language.
- Keep responses natural and conversational.

Examples:

User: "What is Python?"
Response language: English.

User: "Python kya hai?"
Response language: Hinglish.

User: "Bhai Python kya hai explain kar."
Response language: Hinglish.

User: "Python म्हणजे काय?"
Response language: Marathi.

User: "Python mala simple language madhe samjha."
Response language: Marathi-English.

User: "मुझे Python समझाओ।"
Response language: Hindi.

User: "Explain Python in Marathi."
Response language: Marathi.

If the user explicitly asks for a specific language,
follow that request.

IMPORTANT:
These language rules apply to:
- Normal AI responses
- Web-search responses
- Fallback responses



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

\\\\[
a = \\\\frac{dv}{dt}
\\\\]

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

\\\\[
F = ma
\\\\



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

function detectAegisLanguage(text) {
  const value = (text || '').trim().toLowerCase();

  // ============================================================
  // HINDI / MARATHI - DEVANAGARI
  // ============================================================

  if (/[\u0900-\u097F]/.test(value)) {

    // Common Marathi words
    if (
      /(आहे|आहेत|म्हणजे|मला|तुला|तुम्ही|मराठी|मध्ये|साठी|कसे|कसं|करायचं|करा|काय|कसा|कशी)/u.test(value)
    ) {
      return 'marathi';
    }

    // Otherwise treat Devanagari as Hindi
    return 'hindi';
  }


  // ============================================================
  // HINGLISH - HINDI WRITTEN USING ENGLISH LETTERS
  // ============================================================

  if (
    /\b(bhai|kya|hai|hain|mujhe|mera|meri|tum|aap|kaise|kaisa|nahi|nahin|karna|karo|chahiye|bata|batao|kyu|kyon|samjha|samajh|se|ko|ke|ka|ki|me|mein)\b/i
      .test(value.replace(/\n/g, ' '))
  ) {
    return 'hinglish';
  }


  // ============================================================
  // MARATHI - WRITTEN USING ENGLISH LETTERS
  // ============================================================

  if (
    /\b(kaay|kay|ahe|aahe|mala|majha|majhi|tula|tumhi|kasa|kashi|nahi|karaycha|karayche|sathi|madhe|mhanje|sang|sanga|kuthe|kadhi)\b/i
      .test(value.replace(/\n/g, ' '))
  ) {
    return 'marathi-latin';
  }


  // ============================================================
  // DEFAULT
  // ============================================================

  return 'english';
}


/**
 * ============================================================
 * AEGIS AI FALLBACK RESPONSE
 * ============================================================
 *
 * Used when:
 * 1. Gemini API key is missing
 * 2. Gemini request fails
 * 3. All AI models fail
 *
 * Fallback also follows the user's language.
 * ============================================================
 */

function localizedFallbackResponse(userPrompt) {

  const language = detectAegisLanguage(userPrompt);


  // ============================================================
  // HINGLISH
  // ============================================================

  if (language === 'hinglish') {

    return `Hello! 👋

Main Aegis AI hoon, Prathmesh Kadam ne mujhe create aur develop kiya hai.

Aap apna question pucho, main Hinglish mein help karunga.`;
  }


  // ============================================================
  // MARATHI
  // ============================================================

  if (language === 'marathi') {

    return `नमस्कार! 👋

मी Aegis AI आहे, मला Prathmesh Kadam यांनी तयार आणि विकसित केले आहे.

तुमचा प्रश्न विचारा, मी मराठीत मदत करतो.`;
  }


  // ============================================================
  // MARATHI - ENGLISH LETTERS
  // ============================================================

  if (language === 'marathi-latin') {

    return `Namaskar! 👋

Mi Aegis AI aahe, mala Prathmesh Kadam yanni create ani develop kela aahe.

Tumcha question vichara, mi Marathi madhye help karen.`;
  }


  // ============================================================
  // HINDI
  // ============================================================

  if (language === 'hindi') {

    return `नमस्ते! 👋

मैं Aegis AI हूँ, जिसे Prathmesh Kadam ने बनाया और विकसित किया है।

आप अपना सवाल पूछिए, मैं हिंदी में मदद करूँगा।`;
  }


  // ============================================================
  // ENGLISH
  // ============================================================

  return `Hello! 👋

I am Aegis AI, an AI assistant created and developed by Prathmesh Kadam.

Ask me your question and I'll help you.`;
}


/**
 * ============================================================
 * MAIN FALLBACK FUNCTION
 * ============================================================
 */

function generateFallbackResponse(userPrompt, conversationHistory = []) {

  const promptLower = userPrompt.toLowerCase().trim();

  const language = detectAegisLanguage(userPrompt);


  // ============================================================
  // IDENTITY / DEVELOPER QUESTION
  // ============================================================

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

    if (language === 'hinglish') {
      return `Mujhe Prathmesh Kadam ne create aur develop kiya hai.`;
    }

    if (language === 'marathi') {
      return `मला Prathmesh Kadam यांनी तयार आणि विकसित केले आहे.`;
    }

    if (language === 'marathi-latin') {
      return `Mala Prathmesh Kadam yanni create ani develop kela aahe.`;
    }

    if (language === 'hindi') {
      return `मुझे Prathmesh Kadam ने बनाया और विकसित किया है।`;
    }

    return `I was created and developed by Prathmesh Kadam.`;
  }


  // ============================================================
  // WHO ARE YOU?
  // ============================================================

  if (
    promptLower.includes('who are you') ||
    promptLower.includes('what are you') ||
    promptLower.includes('introduce yourself')
  ) {

    if (language === 'hinglish') {

      return `Main Aegis AI hoon, Prathmesh Kadam ne mujhe create aur develop kiya hai.

Main coding, programming, mathematics, technical questions, explanations aur bahut saare tasks mein help kar sakta hoon.`;
    }

    if (language === 'marathi') {

      return `मी Aegis AI आहे, मला Prathmesh Kadam यांनी तयार आणि विकसित केले आहे.

मी coding, programming, mathematics, technical questions आणि इतर अनेक कामांमध्ये मदत करू शकतो.`;
    }

    if (language === 'marathi-latin') {

      return `Mi Aegis AI aahe, mala Prathmesh Kadam yanni create ani develop kela aahe.

Mi coding, programming, mathematics, technical questions ani itar anek tasks madhye help karu shakto.`;
    }

    if (language === 'hindi') {

      return `मैं Aegis AI हूँ, जिसे Prathmesh Kadam ने बनाया और विकसित किया है।

मैं coding, programming, mathematics, technical questions और कई दूसरे tasks में मदद कर सकता हूँ।`;
    }

    return `I am Aegis AI, an AI assistant created and developed by Prathmesh Kadam.

I can help you with coding, programming, mathematics, technical questions, explanations, brainstorming, and many other tasks.`;
  }


  // ============================================================
  // GREETING
  // ============================================================

  if (
    /^(hello|hi|hey|hii|helo|good morning|good afternoon|good evening)[!.,\s]*$/i
      .test(promptLower)
  ) {

    if (language === 'hinglish') {
      return `Hello bhai! 👋

Main Aegis AI hoon.

Kaise help karu?`;
    }

    if (language === 'marathi') {
      return `नमस्कार! 👋

मी Aegis AI आहे.

मी तुमची कशी मदत करू?`;
    }

    if (language === 'marathi-latin') {
      return `Namaskar! 👋

Mi Aegis AI aahe.

Mi tumchi kashi help karu?`;
    }

    if (language === 'hindi') {
      return `नमस्ते! 👋

मैं Aegis AI हूँ।

मैं आपकी कैसे मदद करूँ?`;
    }

    return `Hello! 👋

I am Aegis AI.

How can I help you today?`;
  }


  // ============================================================
  // PYTHON QUESTION - NON-ENGLISH FALLBACK
  // ============================================================

  if (
    promptLower.includes('python') &&
    (
      promptLower.includes('kya') ||
      promptLower.includes('hai') ||
      promptLower.includes('samjha') ||
      promptLower.includes('समझाओ') ||
      promptLower.includes('म्हणजे') ||
      promptLower.includes('आहे')
    )
  ) {

    if (language === 'hinglish') {

      return `## Python kya hai? 🐍

Python ek **high-level, interpreted aur general-purpose programming language** hai.

Simple words mein, Python ka syntax easy aur readable hota hai.

Python ka use:
- AI aur Machine Learning
- Data Science
- Web Development
- Automation
- Software Development

mein kiya jata hai.

Example:

\`\`\`python
print("Hello, World!")
\`\`\`

Output:

\`\`\`
Hello, World!
\`\`\``;
    }

    if (language === 'marathi') {

      return `## Python म्हणजे काय? 🐍

Python ही एक **high-level, interpreted आणि general-purpose programming language** आहे.

Python चा syntax सोपा आणि readable आहे.

Python चा वापर:
- AI आणि Machine Learning
- Data Science
- Web Development
- Automation
- Software Development

यासाठी केला जातो.

Example:

\`\`\`python
print("Hello, World!")
\`\`\``;
    }
  }


  // ============================================================
  // NON-ENGLISH GENERAL FALLBACK
  // ============================================================

  if (language !== 'english') {
    return localizedFallbackResponse(userPrompt);
  }


  // ============================================================
  // ENGLISH PYTHON
  // ============================================================

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

Output:

\`\`\`
Hello, World!
\`\`\`

Python is especially popular for beginners because its syntax is relatively easy to understand.`;
  }


  // ============================================================
  // ENGLISH PYTHON LOOPS
  // ============================================================

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


  // ============================================================
  // ENGLISH PYTHON PROGRAMMING
  // ============================================================

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
    


  // ============================================================
  // JAVASCRIPT QUESTIONS
  // ============================================================

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


  // ============================================================
  // GENERAL CODING QUESTION
  // ============================================================

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


  // ============================================================
  // DEFAULT FALLBACK
  // ============================================================

  if (language === 'hinglish') {

    return `Thank you for your message! 🤖

Main Aegis AI hoon, Prathmesh Kadam ne mujhe create aur develop kiya hai.

Aap apna question pucho, main Hinglish mein help karunga.`;
  }


  if (language === 'marathi') {

    return `नमस्कार! 🤖

मी Aegis AI आहे, मला Prathmesh Kadam यांनी तयार आणि विकसित केले आहे.

तुमचा प्रश्न विचारा, मी मराठीत मदत करतो.`;
  }


  if (language === 'marathi-latin') {

    return `Namaskar! 🤖

Mi Aegis AI aahe, mala Prathmesh Kadam yanni create ani develop kela aahe.

Tumcha question vichara, mi Marathi madhye help karen.`;
  }


  if (language === 'hindi') {

    return `नमस्ते! 🤖

मैं Aegis AI हूँ, जिसे Prathmesh Kadam ने बनाया और विकसित किया है।

आप अपना सवाल पूछिए, मैं हिंदी में मदद करूँगा।`;
  }


  // English fallback

  return `Thank you for your message! 🤖

I am Aegis AI, created and developed by Prathmesh Kadam.

Your message has been securely processed and your conversation is saved to your account.

If you want, ask me a question and I'll help you.`;
}



/**
 * ============================================================
 * POST /api/chat
 * ============================================================
 *
 * Send a message, get AI response,
 * and persist exchange in PostgreSQL.
 */


/**
 * ============================================================
 * AI RESPONSE GENERATOR
 * ============================================================
 */

async function generateWithRetry(
  genAI,
  modelName,
  chatHistory,
  message
) {

  // ============================================================
  // AEGIS AI MODEL FALLBACK CHAIN
  //
  // 1. NVIDIA Nemotron 3 Ultra
  // 2. Gemini 3.5 Flash Lite
  // 3. Gemini 3.6 Flash
  // 4. Gemini 2.5 Flash
  // ============================================================

  const modelsToTry = [
    'nemotron-3-ultra-550b-a55b',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-2.5-flash'
  ];


  for (const currentModel of modelsToTry) {

    try {

      console.log(
        `[AI] Trying model: ${currentModel}`
      );


      // ========================================================
      // NVIDIA NEMOTRON
      // ========================================================

      if (
        currentModel ===
        'nemotron-3-ultra-550b-a55b'
      ) {

        if (!process.env.NVIDIA_API_KEY) {

          throw new Error(
            'NVIDIA_API_KEY is not configured.'
          );
        }


        const messages = [
          {
            role: 'system',
            content: AEGIS_SYSTEM_INSTRUCTION
          }
        ];


        // Convert Gemini-style history
        // to OpenAI/NVIDIA format

        if (Array.isArray(chatHistory)) {

          for (const item of chatHistory) {

            const text = item?.parts
              ?.map(part => part?.text || '')
              .join('')
              .trim();

            if (!text) continue;


            messages.push({
              role:
                item.role === 'model'
                  ? 'assistant'
                  : 'user',
              content: text
            });
          }
        }


        // Current user message

        messages.push({
          role: 'user',
          content: message
        });


        const completion =
          await nvidiaAI.chat.completions.create({

            model:
              'nvidia/nemotron-3-ultra-550b-a55b',

            messages,

            temperature: 0.7,

            max_tokens: 2048
          });


        const text =
          completion
            ?.choices?.[0]
            ?.message
            ?.content
            ?.trim();


        if (!text) {

          throw new Error(
            'Nemotron returned an empty response.'
          );
        }


        console.log(
          '[AI] Nemotron 3 Ultra succeeded.'
        );


        // Return Gemini-compatible structure

        return {

          response: {

            text: () => text

          }

        };
      }


      // ========================================================
      // GEMINI FALLBACK
      // ========================================================

      const model =
        genAI.getGenerativeModel({

          model: currentModel,

          systemInstruction:
            AEGIS_SYSTEM_INSTRUCTION

        });


      const chatSession =
        model.startChat({

          history: chatHistory,

          generationConfig: {

            maxOutputTokens: 2048,

            temperature: 0.7

          }

        });


      const result =
        await chatSession.sendMessage(
          message
        );


      console.log(
        `[AI] ${currentModel} succeeded.`
      );


      return result;


    } catch (error) {

      console.warn(

        `[AI] ${currentModel} failed:`,

        error?.message || error

      );


      // Automatically continue
      // to the next model

      continue;
    }
  }


  // ============================================================
  // ALL MODELS FAILED
  // ============================================================

  throw new Error(
    'All configured AI models are currently unavailable.'
  );
}


/**
 * ============================================================
 * WEB SEARCH
 * ============================================================
 */

async function generateWebSearchResponse(query) {

  console.log(
    '[WEB SEARCH] Searching with Tavily:',
    query
  );


  const searchResult =
    await tavilyClient.search(

      query,

      {
        searchDepth: 'advanced',

        maxResults: 5,

        includeAnswer: true
      }

    );


  if (!searchResult) {

    throw new Error(
      'Tavily returned no result.'
    );
  }


  const results =
    searchResult.results || [];


  if (results.length === 0) {

    throw new Error(
      'Tavily returned no search results.'
    );
  }


  const sourceLinks =
    results.map((item, index) => ({

      number: index + 1,

      title: item.title,

      url: item.url

    }));


  const researchText =
    results

      .map((item, index) =>

        `SOURCE ${index + 1}
Title: ${item.title}
URL: ${item.url}
Content: ${item.content || ''}`

      )

      .join('\n\n');


  const geminiApiKey =
    (process.env.GEMINI_API_KEY || '')
      .trim();


  if (!geminiApiKey) {

    throw new Error(
      'GEMINI_API_KEY is not configured.'
    );
  }


  const genAI =
    new GoogleGenerativeAI(
      geminiApiKey
    );


  const model =
    genAI.getGenerativeModel({

      model: 'gemini-3.6-flash',

      systemInstruction:
        AEGIS_SYSTEM_INSTRUCTION

    });


  const prompt = `
You are Aegis AI.

The user asked:
"${query}"

Use the following fresh web-search results from Tavily:

${researchText}

Give the user a clean, accurate answer based ONLY on the useful information from these search results.

Rules:

- Do NOT copy raw webpage navigation text.
- Do NOT include things like "Edition", "IN", "US", "GCC", language menus, Sign In, Subscribe, Trending Topics, etc.
- Do NOT dump the complete search results.
- Summarize the important information.
- If this is a news question, give the most important recent stories first.
- Use clear headings and bullet points where useful.
- Mention uncertainty when the sources disagree or information is incomplete.
- Do not invent facts.

IMPORTANT LANGUAGE RULE:

Respond in the SAME language and writing style as the user's query.

- English query -> English response.
- Hindi query -> Hindi response.
- Marathi query -> Marathi response.
- Hindi written in English letters -> natural Hinglish.
- Marathi written in English letters -> natural Marathi using English letters.
- Mixed Hindi/English -> preserve the same natural mixture.
- Mixed Marathi/English -> preserve the same natural mixture.

Do NOT automatically translate the answer into English.
`;


  const result =
    await model.generateContent(
      prompt
    );


  const response =
    await result.response;


  const text =
    response.text();


  if (
    !text ||
    text.trim().length === 0
  ) {

    throw new Error(
      'Gemini returned an empty answer.'
    );
  }


  console.log(
    '[WEB SEARCH] Tavily + Gemini completed.'
  );


  return {

    text: text.trim(),

    sources: sourceLinks

  };
}
// ============================================================
// POST /api/chat
// ============================================================

router.post('/', async (req, res) => {

  try {

    let {
      conversationId,
      message
    } = req.body;


    // ========================================================
    // 1. VALIDATE MESSAGE
    // ========================================================

    if (
      !message ||
      typeof message !== 'string' ||
      message.trim().length === 0
    ) {

      return res.status(400).json({

        success: false,

        error:
          'Message content is required.'

      });
    }


    const cleanMessage =
      message.trim();

    let webSources = [];


    // ========================================================
    // 2. CREATE / VERIFY CONVERSATION
    // ========================================================

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

          error:
            'Conversation not found or access denied.'

        });
      }
    }


    // ========================================================
    // 3. SAVE USER MESSAGE
    // ========================================================

    const userMsgResult =
      await messageQueries.add(

        conversationId,

        'user',

        cleanMessage

      );


    await conversationQueries.touchUpdatedAt(

      conversationId

    );


    // ========================================================
    // 4. GET CONVERSATION HISTORY
    // ========================================================

    const recentMessages = (

      await messageQueries.getRecentContext(

        conversationId,

        20

      )

    ).reverse();


    // ========================================================
    // 5. GENERATE AI RESPONSE
    // ========================================================

    let assistantResponseText = '';


    const geminiApiKey =
      (process.env.GEMINI_API_KEY || '')
        .trim();


    if (geminiApiKey) {

      try {

        const genAI =
          new GoogleGenerativeAI(

            geminiApiKey

          );


        // ====================================================
        // Build Gemini history
        // ====================================================

        const historyForGemini = [];

        let expectedRole = 'user';


        for (
          const m of recentMessages.slice(0, -1)
        ) {

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


        // ====================================================
        // Decide whether web search is needed
        // ====================================================

        const needsWebSearch =
          /latest|today|news|current|recent|weather|price|stock|score|live|2026/i
            .test(cleanMessage);


        // ====================================================
        // WEB SEARCH
        // ====================================================

        if (needsWebSearch) {

          console.log(

            '[WEB SEARCH] Using web search for:',

            cleanMessage

          );


          const webResult =
            await generateWebSearchResponse(

              cleanMessage

            );


          assistantResponseText =
            webResult.text;


          webSources =
            webResult.sources || [];


        } else {

          // ==================================================
          // NORMAL AI RESPONSE
          // ==================================================

          const result =
            await generateWithRetry(

              genAI,

              'gemini-3.5-flash',

              historyForGemini,

              cleanMessage

            );


          const response =
            await result.response;


          assistantResponseText =
            response.text();

        }


        // ====================================================
        // Safety check
        // ====================================================

        if (

          !assistantResponseText ||

          assistantResponseText
            .trim()
            .length === 0

        ) {

          throw new Error(

            'AI returned an empty response.'

          );

        }


      } catch (aiErr) {

        console.warn(

          '[AI] Gemini error. Using Aegis fallback:',

          aiErr.message

        );


        assistantResponseText =
          generateFallbackResponse(

            cleanMessage,

            recentMessages

          );

      }


    } else {

      // ======================================================
      // GEMINI API KEY NOT CONFIGURED
      // ======================================================

      console.warn(

        '[AI] GEMINI_API_KEY is not configured.'

      );


      assistantResponseText =
        generateFallbackResponse(

          cleanMessage,

          recentMessages

        );

    }


    // ========================================================
    // 6. SAVE ASSISTANT RESPONSE
    // ========================================================

    const assistantMsgResult =
      await messageQueries.add(

        conversationId,

        'assistant',

        assistantResponseText

      );


    await conversationQueries.touchUpdatedAt(

      conversationId

    );


    // ========================================================
    // 7. UPDATE CONVERSATION TITLE
    // ========================================================

    let updatedTitle = null;


    const currentConv =
      await conversationQueries.getByIdAndUser(

        conversationId,

        req.user.id

      );


    if (

      currentConv &&

      (

        currentConv.title ===
          'New Conversation' ||

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


      updatedTitle =
        generatedTitle;

    }


    // ========================================================
    // 8. SEND RESPONSE TO FRONTEND
    // ========================================================

    return res.json({

      success: true,

      conversationId,

      updatedTitle,


      userMessage: {

        id:
          userMsgResult.id,

        conversation_id:
          conversationId,

        role:
          'user',

        content:
          cleanMessage,

        created_at:
          userMsgResult.created_at ||
          new Date().toISOString()

      },


      assistantMessage: {

        id:
          assistantMsgResult.id,

        conversation_id:
          conversationId,

        role:
          'assistant',

        content:
          assistantResponseText,

        sources:
          webSources,

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


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;