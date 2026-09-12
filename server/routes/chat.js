const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const { conversationQueries, messageQueries } = require("../db/database");

const { authenticateToken } = require("../middleware/auth");

const {
  buildMemoryContext,
  markMemoriesAccessed,
  extractAndSaveMemories,
} = require("../services/memoryService");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleGenAI } = require("@google/genai");
const OpenAI = require("openai");
const { tavily } = require("@tavily/core");
const mammoth = require("mammoth");

const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});

const webAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const nvidiaAI = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

// ============================================================
// FILE ANALYSIS CONSTANTS
// ============================================================

const SUPPORTED_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const FILE_MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Maximum accepted file size (raw bytes) for uploaded files.
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

async function testWebSearch(query) {
  const response = await webAI.models.generateContent({
    model: "gemini-3.7-flash",
    contents: query,
    config: {
      tools: [
        {
          googleSearch: {},
        },
      ],
    },
  });

  return response;
}

router.get("/test-web-search", authenticateToken, async (req, res) => {
  try {
    const result = await testWebSearch(
      "What is the latest major news in India today?",
    );

    res.json({
      success: true,
      text: result.text,
    });
  } catch (error) {
    console.error("[WEB SEARCH TEST ERROR]", error);

    res.status(500).json({
      success: false,
      error: error.message,
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
 * LANGUAGE DETECTION
 * ============================================================
 */

function detectAegisLanguage(text) {
  const value = (text || "").trim().toLowerCase();

  if (/[\u0900-\u097F]/.test(value)) {
    if (
      /(आहे|आहेत|म्हणजे|मला|तुला|तुम्ही|मराठी|मध्ये|साठी|कसे|कसं|करायचं|करा|काय|कसा|कशी)/u.test(
        value,
      )
    ) {
      return "marathi";
    }

    return "hindi";
  }

  if (
    /\b(bhai|kya|hai|hain|mujhe|mera|meri|tum|aap|kaise|kaisa|nahi|nahin|karna|karo|chahiye|bata|batao|kyu|kyon|samjha|samajh|se|ko|ke|ka|ki|me|mein)\b/i.test(
      value.replace(/\n/g, " "),
    )
  ) {
    return "hinglish";
  }

  if (
    /\b(kaay|kay|ahe|aahe|mala|majha|majhi|tula|tumhi|kasa|kashi|nahi|karaycha|karayche|sathi|madhe|mhanje|sang|sanga|kuthe|kadhi)\b/i.test(
      value.replace(/\n/g, " "),
    )
  ) {
    return "marathi-latin";
  }

  return "english";
}
/**
 * ============================================================
 * HELPER FUNCTIONS
 * ============================================================
 */

function cleanAIText(text) {
  if (!text) return "";

  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function getGeminiModel(genAI, modelName) {
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: AEGIS_SYSTEM_INSTRUCTION,
  });
}

/**
 * ============================================================
 * AI FALLBACK RESPONSE
 * ============================================================
 */

function getAegisFallbackResponse(userMessage) {
  const language = detectAegisLanguage(userMessage);

  if (language === "hinglish") {
    return `Bhai, abhi AI service temporarily available nahi hai. Thodi der baad dobara try kar.`;
  }

  if (language === "marathi" || language === "marathi-latin") {
    return `सध्या AI service temporarily available नाही. कृपया थोड्या वेळाने पुन्हा try करा.`;
  }

  if (language === "hindi") {
    return `अभी AI service temporarily available नहीं है। थोड़ी देर बाद फिर से try करें।`;
  }

  return `I'm sorry, but the AI service is temporarily unavailable. Please try again in a moment.`;
}

/**
 * ============================================================
 * WEB SEARCH RESPONSE
 * ============================================================
 */

async function generateWebSearchResponse(query) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not configured.");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  console.log("[WEB SEARCH] Searching:", query);

  const searchResult = await tavilyClient.search(query, {
    searchDepth: "advanced",
    maxResults: 6,
    includeAnswer: false,
  });

  const results = Array.isArray(searchResult?.results)
    ? searchResult.results
    : [];

  if (!results.length) {
    throw new Error("No web search results found.");
  }

  const sourcesText = results
    .map((result, index) => {
      return `
SOURCE ${index + 1}
Title: ${result.title || "Untitled"}
URL: ${result.url || ""}
Content:
${result.content || ""}
`;
    })
    .join("\n");

  const language = detectAegisLanguage(query);

  const languageInstruction =
    language === "hinglish"
      ? "Answer in natural Hinglish because the user asked in Hinglish."
      : language === "hindi"
        ? "Answer in Hindi because the user asked in Hindi."
        : language === "marathi" || language === "marathi-latin"
          ? "Answer in Marathi because the user asked in Marathi."
          : "Answer in English because the user asked in English.";

  const prompt = `
You are answering a user using fresh web-search information.

USER QUERY:
${query}

SEARCH RESULTS:
${sourcesText}

${languageInstruction}

Instructions:
- Answer the actual question directly.
- Use the search results as your factual basis.
- Do not invent facts that are not supported by the sources.
- If sources disagree or information is uncertain, say so.
- Prefer recent information when the question asks for latest/current information.
- Keep the answer clear and useful.
- Do not dump the raw search results.
- Mention useful source URLs at the end when appropriate.
`;

  const model = webAI.models;

  const response = await model.generateContent({
    model: "gemini-3.7-flash",
    contents: prompt,
    config: {
      systemInstruction: AEGIS_SYSTEM_INSTRUCTION,
    },
  });

  const text = cleanAIText(response?.text || "");

  if (!text) {
    throw new Error("Web search AI returned an empty response.");
  }

  return {
    text,
    sources: results.map((result) => ({
      title: result.title || "Source",
      url: result.url || "",
    })),
  };
}

/**
 * ============================================================
 * IMAGE / VISION RESPONSE
 * ============================================================
 */

async function generateVisionResponse({
  message,
  imageData,
  imageMimeType = "image/jpeg",
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  if (!imageData) {
    throw new Error("Image data is missing.");
  }

  console.log("[VISION] 🖼️ Analyzing image...");

  const model = webAI.models;

  const prompt = `
Analyze the image carefully and answer the user's request.

User request:
${message || "Please analyze this image."}

Important:
- Describe only what can reasonably be determined from the image.
- If the user asks a question about visible content, answer it directly.
- If the image contains a mathematical, programming, academic or technical question,
  solve it clearly and step by step when appropriate.
- If text is visible in the image, read it carefully.
- Do not invent details that cannot be seen.
- Follow the user's language.
`;

  const response = await model.generateContent({
    model: "gemini-3.7-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
          {
            inlineData: {
              mimeType: imageMimeType,
              data: imageData,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: AEGIS_SYSTEM_INSTRUCTION,
    },
  });

  const text = cleanAIText(response?.text || "");

  if (!text) {
    throw new Error("Vision model returned an empty response.");
  }

  console.log("[VISION] ✅ Image analysis completed.");

  return text;
}

/**
 * ============================================================
 * FILE ANALYSIS RESPONSE
 *
 * Supported files:
 * - PDF  -> sent to Gemini as inline data (application/pdf)
 * - TXT  -> sent to Gemini as inline data (text/plain)
 * - DOCX -> text is extracted server-side with mammoth and
 *           passed to Gemini as text (DOCX is not accepted as
 *           raw inline data by the Gemini API)
 *
 * API keys stay on the server. They are never exposed to the
 * mobile app.
 * ============================================================
 */

function getFileExtension(fileName) {
  const name = String(fileName || "");
  const dotIndex = name.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === name.length - 1) {
    return "";
  }

  return name
    .substring(dotIndex + 1)
    .trim()
    .toLowerCase();
}

function resolveFileMimeType({ fileMimeType, fileName }) {
  const mime = String(fileMimeType || "")
    .trim()
    .toLowerCase();

  if (SUPPORTED_FILE_MIME_TYPES.has(mime)) {
    return mime;
  }

  return FILE_MIME_BY_EXTENSION[getFileExtension(fileName)] || "";
}

function base64ByteLength(base64) {
  if (!base64) return 0;

  const value = String(base64).trim();

  if (!value) return 0;

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;

  return Math.floor((value.length * 3) / 4) - padding;
}

async function extractDocxText(fileData) {
  const buffer = Buffer.from(fileData, "base64");

  const result = await mammoth.extractRawText({ buffer });

  const text = String(result?.value || "").trim();

  if (!text) {
    throw new Error("Could not read any text from the DOCX file.");
  }

  return text;
}

async function generateFileAnalysisResponse({
  message,
  fileData,
  fileMimeType,
  fileName,
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  if (!fileData) {
    throw new Error("File data is missing.");
  }

  const mimeType = resolveFileMimeType({
    fileMimeType,
    fileName,
  });

  if (!SUPPORTED_FILE_MIME_TYPES.has(mimeType)) {
    throw new Error("Unsupported file type. Supported files: PDF, TXT, DOCX.");
  }

  const fileBytes = base64ByteLength(fileData);

  if (fileBytes === 0) {
    throw new Error("The uploaded file is empty.");
  }

  if (fileBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error("File is too large. Maximum size is 8 MB.");
  }

  console.log(
    "[FILE] 📎 Analyzing file:",
    fileName || "uploaded file",
    `(${mimeType})`,
  );

  const prompt = `
Analyze the attached file${fileName ? ` "${fileName}"` : ""} and answer the user's request.

User request:
${message || "Please analyze this file."}

Important:
- Read the file content carefully and answer only based on what is actually in the file.
- If the file contains chapters, topics, code or questions, follow the user's instruction for those.
- If the user asks for a summary, important points, errors, or a simple explanation, do that directly.
- Do not invent details that are not present in the file.
- Follow the user's language.
`;

  const parts = [{ text: prompt }];

  const model = webAI.models;

  if (mimeType === DOCX_MIME_TYPE) {
    // DOCX is not accepted as raw inline data, so extract the
    // text server-side and include it in the prompt.
    const docxText = await extractDocxText(fileData);

    parts.push({
      text: `\n\nFile content (from "${fileName || "document.docx"}"):\n${docxText}`,
    });
  } else {
    parts.push({
      inlineData: {
        mimeType,
        data: fileData,
      },
    });
  }

  const response = await model.generateContent({
    model: "gemini-3.7-flash",
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    config: {
      systemInstruction: AEGIS_SYSTEM_INSTRUCTION,
    },
  });

  const text = cleanAIText(response?.text || "");

  if (!text) {
    throw new Error("File analysis model returned an empty response.");
  }

  console.log("[FILE] ✅ File analysis completed.");

  return text;
}

/**
 * ============================================================
 * NORMAL AI GENERATION
 *
 * PRIMARY:
 *   Nemotron 3 Ultra
 *
 * FALLBACK:
 *   Gemini 3.7 Flash
 *   Gemini 3.6 Flash
 *   Gemini 3.5 Flash Lite
 *
 * FINAL:
 *   Aegis fallback
 * ============================================================
 */

async function generateWithRetry({ genAI, messages, userMessage }) {
  /**
   * ----------------------------------------------------------
   * PRIMARY — NVIDIA NEMOTRON 3 ULTRA
   * ----------------------------------------------------------
   */

  try {
    console.log("[AI] 🧠 Trying Nemotron 3 Ultra...");

    const completion = await nvidiaAI.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      messages,
      max_tokens: 4096,
    });

    const text = cleanAIText(completion?.choices?.[0]?.message?.content || "");

    if (!text) {
      throw new Error("Nemotron returned an empty response.");
    }

    console.log("[AI] 🧠 Nemotron 3 Ultra succeeded.");

    return {
      text,
      provider: "nemotron",
    };
  } catch (nemotronError) {
    console.error(
      "[AI] ⚠️ Nemotron failed:",
      nemotronError?.message || nemotronError,
    );
  }

  /**
   * ----------------------------------------------------------
   * FALLBACK — GEMINI
   * ----------------------------------------------------------
   */

  if (!genAI) {
    throw new Error("Gemini API is not configured and Nemotron failed.");
  }

  const modelsToTry = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[AI] 🔄 Trying Gemini model: ${modelName}`);

      const model = getGeminiModel(genAI, modelName);

      const result = await model.generateContent({
        contents: messages
          .filter((item) => item.role !== "system")
          .map((item) => ({
            role: item.role === "assistant" ? "model" : "user",
            parts: [
              {
                text: item.content,
              },
            ],
          })),
        generationConfig: {
          maxOutputTokens: 1024,
        },
      });

      const text = cleanAIText(result?.response?.text?.() || "");

      if (!text) {
        throw new Error(`${modelName} returned an empty response.`);
      }

      console.log(`[AI] ✅ ${modelName} succeeded.`);

      return {
        text,
        provider: modelName,
      };
    } catch (geminiError) {
      console.error(
        `[AI] ⚠️ ${modelName} failed:`,
        geminiError?.message || geminiError,
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * FINAL FALLBACK
   * ----------------------------------------------------------
   */

  console.log("[AI] 🛡️ Using Aegis fallback response.");

  return {
    text: getAegisFallbackResponse(userMessage),
    provider: "aegis-fallback",
  };
}

/**
 * ============================================================
 * STREAMING AI GENERATION
 *
 * PRIMARY:
 *   Nemotron 3 Ultra
 *
 * FALLBACK:
 *   Gemini models
 *
 * FINAL:
 *   Aegis fallback
 * ============================================================
 */

async function streamWithRetry({ genAI, messages, userMessage, onChunk }) {
  /**
   * ----------------------------------------------------------
   * PROVIDER STREAM IDLE-TIMEOUT
   *
   * A provider SSE stream can stop sending data without ever
   * closing the connection (observed with Nemotron: `chunk`
   * events arrive, then the stream hangs, so the code after
   * `await streamWithRetry()` — the final `done` SSE event and
   * `res.end()` — is never reached and the client stays blocked).
   *
   * The watchdog below fires only after AI_STREAM_IDLE_TIMEOUT_MS
   * WITHOUT incoming wire data. Every received chunk re-arms it,
   * so a slow-but-healthy stream is never truncated. On timeout,
   * the upstream stream is cancelled through its SDK-supported
   * mechanism and the idle error propagates to the existing
   * provider catch blocks, so the fallback chain
   * (Nemotron → Gemini → Aegis) continues exactly as with any
   * other provider error.
   * ----------------------------------------------------------
   */
  const AI_STREAM_IDLE_TIMEOUT_MS = 60 * 1000;

  async function consumeStreamWithIdleTimeout({ label, cancel, startConsume }) {
    let idleTimerId = null;
    let consumePromise = null;
    let rejectIdle = null;

    // Settles only when the idle watchdog fires. Promise.race attaches
    // handlers to it, so a never-settling (healthy case) or
    // already-settled rejection can never become an unhandled rejection.
    const idlePromise = new Promise((_, reject) => {
      rejectIdle = reject;
    });

    const armIdleTimer = () => {
      clearTimeout(idleTimerId);
      idleTimerId = setTimeout(() => {
        const idleError = new Error(
          `[AI STREAM] ${label} stream idle timeout: no data for ${AI_STREAM_IDLE_TIMEOUT_MS}ms.`,
        );
        idleError.code = "AI_STREAM_IDLE_TIMEOUT";
        rejectIdle(idleError);
      }, AI_STREAM_IDLE_TIMEOUT_MS);
    };

    try {
      consumePromise = Promise.resolve(startConsume(armIdleTimer));
      return await Promise.race([consumePromise, idlePromise]);
    } catch (err) {
      if (err && err.code === "AI_STREAM_IDLE_TIMEOUT") {
        console.warn(
          `[AI STREAM] ⏱️ ${label} idle timeout (${AI_STREAM_IDLE_TIMEOUT_MS}ms without data) — cancelling stream, continuing fallback chain.`,
        );
      }
      // Cancel the upstream request via its supported mechanism so the
      // wedged iterator unwinds instead of holding the socket open.
      // Safe no-op when the stream already finished or errored.
      if (typeof cancel === "function") {
        try {
          cancel();
        } catch (cancelError) {
          console.warn(
            `[AI STREAM] ⚠️ Could not cancel ${label} stream:`,
            cancelError?.message || cancelError,
          );
        }
      }
      // The abandoned iterator may settle later (typically with an
      // abort-induced rejection); swallow it so it can never surface
      // as an unhandled promise rejection.
      if (consumePromise) {
        consumePromise.catch(() => {});
      }
      throw err;
    } finally {
      clearTimeout(idleTimerId);
    }
  }

  /**
   * ----------------------------------------------------------
   * PRIMARY — NEMOTRON 3 ULTRA STREAM
   * ----------------------------------------------------------
   */

  try {
    console.log("[AI STREAM] 🧠 Trying Nemotron 3 Ultra...");

    const stream = await nvidiaAI.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      messages,
      max_tokens: 4096,
      stream: true,
    });

    let fullText = "";

    // OpenAI SDK Stream exposes `controller` — a public AbortController
    // for the underlying HTTP request (openai v7.8.0,
    // core/streaming.d.ts; the SDK itself checks
    // `stream.controller.signal.aborted` after consuming a stream).
    // Aborting it rejects the SDK's pending reader and ends the stuck
    // iteration cleanly instead of hanging forever.
    const cancelNemotronStream = () => {
      if (typeof stream.controller?.abort === "function") {
        stream.controller.abort();
      }
    };

    fullText = await consumeStreamWithIdleTimeout({
      label: "Nemotron",
      cancel: cancelNemotronStream,
      startConsume: async (armIdleTimer) => {
        armIdleTimer();

        for await (const chunk of stream) {
          // Any incoming wire data counts as activity and re-arms the
          // idle watchdog, even chunks without a content delta.
          armIdleTimer();

          const delta = chunk?.choices?.[0]?.delta?.content || "";

          if (!delta) continue;

          fullText += delta;

          if (typeof onChunk === "function") {
            onChunk(delta);
          }
        }

        return fullText;
      },
    });

    fullText = cleanAIText(fullText);

    if (!fullText) {
      throw new Error("Nemotron streaming returned an empty response.");
    }

    console.log("[AI STREAM] 🧠 Nemotron 3 Ultra succeeded.");

    return {
      text: fullText,
      provider: "nemotron",
    };
  } catch (nemotronError) {
    console.error(
      "[AI STREAM] ⚠️ Nemotron failed:",
      nemotronError?.message || nemotronError,
    );
  }

  /**
   * ----------------------------------------------------------
   * FALLBACK — GEMINI STREAM
   * ----------------------------------------------------------
   */

  if (!genAI) {
    throw new Error("Gemini API is not configured and Nemotron failed.");
  }

  const modelsToTry = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[AI STREAM] 🔄 Trying Gemini model: ${modelName}`);

      const model = getGeminiModel(genAI, modelName);

      const contents = messages
        .filter((item) => item.role !== "system")
        .map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [
            {
              text: item.content,
            },
          ],
        }));

      // @google/generative-ai (v0.24.x, the SDK used by getGeminiModel)
      // supports per-call request cancellation through the
      // `SingleRequestOptions.signal` passed as the second argument of
      // generateContentStream. The SDK composes that signal into the
      // fetch's own AbortController (buildFetchOptions), so aborting it
      // errors the streaming response body and unwinds the pending
      // reader — the safest SDK-supported cancellation mechanism in
      // this version (the returned generator has no cleanup of its own).
      const geminiAbortController = new AbortController();

      const result = await model.generateContentStream(
        {
          contents,
          generationConfig: {
            maxOutputTokens: 1024,
          },
        },
        { signal: geminiAbortController.signal },
      );

      let fullText = "";

      fullText = await consumeStreamWithIdleTimeout({
        label: modelName,
        cancel: () => geminiAbortController.abort(),
        startConsume: async (armIdleTimer) => {
          armIdleTimer();

          for await (const chunk of result.stream) {
            // Any incoming wire data counts as activity and re-arms the
            // idle watchdog, even chunks without a text delta.
            armIdleTimer();

            const delta = chunk?.text?.() || "";

            if (!delta) continue;

            fullText += delta;

            if (typeof onChunk === "function") {
              onChunk(delta);
            }
          }

          return fullText;
        },
      });

      fullText = cleanAIText(fullText);

      if (!fullText) {
        throw new Error(`${modelName} returned an empty streaming response.`);
      }

      console.log(`[AI STREAM] ✅ ${modelName} succeeded.`);

      return {
        text: fullText,
        provider: modelName,
      };
    } catch (geminiError) {
      console.error(
        `[AI STREAM] ⚠️ ${modelName} failed:`,
        geminiError?.message || geminiError,
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * FINAL STREAM FALLBACK
   * ----------------------------------------------------------
   */

  const fallbackText = getAegisFallbackResponse(userMessage);

  if (typeof onChunk === "function") {
    onChunk(fallbackText);
  }

  return {
    text: fallbackText,
    provider: "aegis-fallback",
  };
}
/**
 * ============================================================
 * POST /api/chat
 * NORMAL NON-STREAMING CHAT
 * ============================================================
 */

router.post("/", async (req, res) => {
  try {
    const {
      conversationId,
      message,
      imageData,
      imageMimeType,
      fileData,
      fileMimeType,
      fileName,
    } = req.body;

    const cleanMessage = typeof message === "string" ? message.trim() : "";

    if (!cleanMessage && !imageData && !fileData) {
      return res.status(400).json({
        success: false,
        error: "Message, image or file is required.",
      });
    }

    /**
     * --------------------------------------------------------
     * FILE VALIDATION
     * --------------------------------------------------------
     */

    if (fileData) {
      const resolvedMimeType = resolveFileMimeType({
        fileMimeType,
        fileName,
      });

      if (!SUPPORTED_FILE_MIME_TYPES.has(resolvedMimeType)) {
        return res.status(400).json({
          success: false,
          error: "Unsupported file type. Supported files: PDF, TXT, DOCX.",
        });
      }

      const fileBytes = base64ByteLength(fileData);

      if (fileBytes === 0) {
        return res.status(400).json({
          success: false,
          error: "The uploaded file is empty.",
        });
      }

      if (fileBytes > MAX_FILE_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          error: "File is too large. Maximum size is 8 MB.",
        });
      }
    }

    const userId = req.user.id;

    console.log(`[CHAT] User ${userId} sent a message`);

    /**
     * --------------------------------------------------------
     * CONVERSATION
     * --------------------------------------------------------
     */

    let activeConversationId = conversationId;

    if (!activeConversationId) {
      const titleSource =
        cleanMessage || (fileData ? "File Analysis" : "Image Analysis");

      const title =
        titleSource.length > 60
          ? `${titleSource.substring(0, 57)}...`
          : titleSource;

      const conversation = await conversationQueries.create(
        uuidv4(),
        userId,
        title,
      );

      activeConversationId = conversation.id;

      console.log(`[CHAT] Created conversation ${activeConversationId}`);
    } else {
      /**
       * Make sure the conversation belongs
       * to the authenticated user.
       */

      const conversation = await conversationQueries.findById(
        activeConversationId,
        userId,
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found.",
        });
      }
    }

    /**
     * --------------------------------------------------------
     * SAVE USER MESSAGE
     * --------------------------------------------------------
     */

    const userMessageText =
      cleanMessage ||
      (imageData
        ? "Please analyze this image."
        : fileName
          ? `Please analyze the attached file ${fileName}.`
          : "Please analyze this file.");

    const savedUserMessage = await messageQueries.create(
      activeConversationId,
      "user",
      userMessageText,
    );

    console.log(`[CHAT] Saved user message ${savedUserMessage.id}`);

    /**
     * --------------------------------------------------------
     * BUILD CONVERSATION HISTORY
     * --------------------------------------------------------
     */

    const history =
      await messageQueries.findByConversation(activeConversationId);

    const recentHistory = Array.isArray(history) ? history.slice(-20) : [];

    /**
     * --------------------------------------------------------
     * LONG-TERM MEMORY CONTEXT (Phase 1)
     * A memory-layer failure must never break the chat response.
     * --------------------------------------------------------
     */

    let memoryContext = "";
    let usedMemoryIds = [];

    try {
      const memoryData = await buildMemoryContext(userId, 20);

      memoryContext = memoryData?.context || "";
      usedMemoryIds = Array.isArray(memoryData?.memoryIds)
        ? memoryData.memoryIds
        : [];
    } catch (memoryContextError) {
      console.error(
        "[MEMORY CONTEXT ERROR]",
        memoryContextError?.message || memoryContextError,
      );
    }

    const messages = [
      {
        role: "system",
        content: AEGIS_SYSTEM_INSTRUCTION + memoryContext,
      },
      ...recentHistory.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content || "",
      })),
    ];

    /**
     * --------------------------------------------------------
     * AI CONFIGURATION
     * --------------------------------------------------------
     */

    const geminiApiKey = process.env.GEMINI_API_KEY;

    const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

    /**
     * --------------------------------------------------------
     * WEB SEARCH DETECTION
     * --------------------------------------------------------
     */

    const needsWebSearch =
      !fileData &&
      !imageData &&
      /latest|today|news|current|recent|weather|price|stock|score|live|2026/i.test(
        cleanMessage,
      );

    let aiText = "";
    let provider = "unknown";
    let sources = [];

    /**
     * --------------------------------------------------------
     * IMAGE HAS HIGHEST PRIORITY
     * --------------------------------------------------------
     */

    if (fileData) {
      console.log("[CHAT] 📎 File request detected.");

      aiText = await generateFileAnalysisResponse({
        message: cleanMessage || "Please analyze this file.",
        fileData,
        fileMimeType,
        fileName: fileName || "uploaded file",
      });

      provider = "gemini-file";
    } else if (imageData) {
      console.log("[CHAT] 🖼️ Image request detected.");

      aiText = await generateVisionResponse({
        message: cleanMessage || "Please analyze this image.",
        imageData,
        imageMimeType: imageMimeType || "image/jpeg",
      });

      provider = "gemini-vision";
    } else if (needsWebSearch) {
      /**
       * --------------------------------------------------------
       * WEB SEARCH
       * --------------------------------------------------------
       */
      console.log("[CHAT] 🌐 Web search request detected.");

      try {
        const webResponse = await generateWebSearchResponse(cleanMessage);

        aiText = webResponse.text;

        sources = webResponse.sources || [];

        provider = "web-search";
      } catch (webError) {
        console.error(
          "[CHAT] ⚠️ Web search failed:",
          webError?.message || webError,
        );

        /**
         * If web search fails, continue with
         * normal AI instead of returning an error.
         */

        const result = await generateWithRetry({
          genAI,
          messages,
          userMessage: cleanMessage,
        });

        aiText = result.text;

        provider = result.provider;
      }
    } else {
      /**
       * --------------------------------------------------------
       * NORMAL AI CHAT
       * --------------------------------------------------------
       */
      const result = await generateWithRetry({
        genAI,
        messages,
        userMessage: cleanMessage,
      });

      aiText = result.text;

      provider = result.provider;
    }

    /**
     * --------------------------------------------------------
     * SAFETY CHECK
     * --------------------------------------------------------
     */

    if (!aiText) {
      aiText = getAegisFallbackResponse(cleanMessage);

      provider = "aegis-fallback";
    }

    /**
     * --------------------------------------------------------
     * SAVE ASSISTANT MESSAGE
     * --------------------------------------------------------
     */

    const savedAssistantMessage = await messageQueries.create(
      activeConversationId,
      "assistant",
      aiText,
    );

    console.log(`[CHAT] Saved assistant message ${savedAssistantMessage.id}`);

    /**
     * --------------------------------------------------------
     * UPDATE CONVERSATION
     * --------------------------------------------------------
     */

    try {
      if (typeof conversationQueries.updateTimestamp === "function") {
        await conversationQueries.updateTimestamp(activeConversationId);
      }
    } catch (timestampError) {
      console.error(
        "[CHAT] ⚠️ Failed to update conversation timestamp:",
        timestampError?.message || timestampError,
      );
    }

    /**
     * --------------------------------------------------------
     * LONG-TERM MEMORY (Phase 1) — ACCESS TRACKING + EXTRACTION
     * Both are best-effort: they run only after the AI response
     * was successfully generated and saved, and neither may
     * affect the response that is about to be returned.
     * --------------------------------------------------------
     */

    try {
      await markMemoriesAccessed(userId, usedMemoryIds);
    } catch (memoryAccessError) {
      console.error(
        "[MEMORY ACCESS ERROR]",
        memoryAccessError?.message || memoryAccessError,
      );
    }

    try {
      await extractAndSaveMemories({
        userId,
        userMessage: cleanMessage,
        assistantMessage: aiText,
      });
    } catch (memoryError) {
      console.error(
        "[MEMORY EXTRACTION ERROR]",
        memoryError?.message || memoryError,
      );
    }

    /**
     * --------------------------------------------------------
     * RESPONSE
     * --------------------------------------------------------
     */

    return res.json({
      success: true,

      conversationId: activeConversationId,

      message: {
        id: savedAssistantMessage.id,
        role: "assistant",
        content: aiText,
      },

      provider,

      sources,
    });
  } catch (error) {
    console.error("[CHAT ERROR]", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to generate AI response.",
    });
  }
});

/**
 * ============================================================
 * GET /api/chat/:conversationId
 * GET CONVERSATION MESSAGES
 * ============================================================
 */

router.get("/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;

    const userId = req.user.id;

    const conversation = await conversationQueries.findById(
      conversationId,
      userId,
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found.",
      });
    }

    const messages = await messageQueries.findByConversation(conversationId);

    return res.json({
      success: true,
      conversation,
      messages,
    });
  } catch (error) {
    console.error("[GET CONVERSATION ERROR]", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to load conversation.",
    });
  }
});

/**
 * ============================================================
 * DELETE /api/chat/:conversationId
 * DELETE CONVERSATION
 * ============================================================
 */

router.delete("/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;

    const userId = req.user.id;

    const conversation = await conversationQueries.findById(
      conversationId,
      userId,
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found.",
      });
    }

    await conversationQueries.delete(conversationId, userId);

    return res.json({
      success: true,
      message: "Conversation deleted successfully.",
    });
  } catch (error) {
    console.error("[DELETE CONVERSATION ERROR]", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to delete conversation.",
    });
  }
});

/**
 * ============================================================
 * POST /api/chat/stream
 * STREAMING CHAT
 * ============================================================
 */

router.post("/stream", async (req, res) => {
  try {
    const { conversationId, message, imageData, imageMimeType } = req.body;

    const cleanMessage = typeof message === "string" ? message.trim() : "";

    if (!cleanMessage && !imageData) {
      return res.status(400).json({
        success: false,
        error: "Message or image is required.",
      });
    }

    const userId = req.user.id;

    console.log(`[AI STREAM] User ${userId} started streaming`);

    /**
     * ------------------------------------------------------
     * CONVERSATION
     * ------------------------------------------------------
     */

    let activeConversationId = conversationId;

    if (!activeConversationId) {
      const titleSource = cleanMessage || "Image Analysis";

      const title =
        titleSource.length > 60
          ? `${titleSource.substring(0, 57)}...`
          : titleSource;

      const conversation = await conversationQueries.create(
        uuidv4(),
        userId,
        title,
      );

      activeConversationId = conversation.id;
    } else {
      const conversation = await conversationQueries.findById(
        activeConversationId,
        userId,
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found.",
        });
      }
    }

    /**
     * ------------------------------------------------------
     * SAVE USER MESSAGE
     * ------------------------------------------------------
     */

    const userMessageText = cleanMessage || "Please analyze this image.";

    await messageQueries.create(activeConversationId, "user", userMessageText);

    /**
     * ------------------------------------------------------
     * LOAD HISTORY
     * ------------------------------------------------------
     */

    const history =
      await messageQueries.findByConversation(activeConversationId);

    const recentHistory = Array.isArray(history) ? history.slice(-20) : [];

    /**
     * ------------------------------------------------------
     * LONG-TERM MEMORY CONTEXT (Phase 1)
     * A memory-layer failure must never break the stream.
     * ------------------------------------------------------
     */

    let memoryContext = "";
    let usedMemoryIds = [];

    try {
      const memoryData = await buildMemoryContext(userId, 20);

      memoryContext = memoryData?.context || "";
      usedMemoryIds = Array.isArray(memoryData?.memoryIds)
        ? memoryData.memoryIds
        : [];
    } catch (memoryContextError) {
      console.error(
        "[MEMORY CONTEXT ERROR]",
        memoryContextError?.message || memoryContextError,
      );
    }

    const messages = [
      {
        role: "system",
        content: AEGIS_SYSTEM_INSTRUCTION + memoryContext,
      },
      ...recentHistory.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content || "",
      })),
    ];

    /**
     * ------------------------------------------------------
     * GEMINI CONFIG
     * ------------------------------------------------------
     */

    const geminiApiKey = process.env.GEMINI_API_KEY;

    const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

    /**
     * ------------------------------------------------------
     * RESPONSE HEADERS
     * ------------------------------------------------------
     */

    res.status(200);

    res.setHeader("Content-Type", "text/event-stream");

    res.setHeader("Cache-Control", "no-cache, no-transform");

    res.setHeader("Connection", "keep-alive");

    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    /**
     * ------------------------------------------------------
     * SEND SSE EVENT
     * ------------------------------------------------------
     */

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);

      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    /**
     * ------------------------------------------------------
     * IMAGE STREAM
     * ------------------------------------------------------
     */

    if (imageData) {
      console.log("[AI STREAM] 🖼️ Image analysis request.");

      try {
        const aiText = await generateVisionResponse({
          message: cleanMessage || "Please analyze this image.",
          imageData,
          imageMimeType: imageMimeType || "image/jpeg",
        });

        sendEvent("chunk", {
          content: aiText,
        });

        await messageQueries.create(activeConversationId, "assistant", aiText);

        sendEvent("done", {
          conversationId: activeConversationId,
          provider: "gemini-vision",
        });

        return res.end();
      } catch (visionError) {
        console.error("[AI STREAM] Vision error:", visionError);

        sendEvent("error", {
          message: visionError?.message || "Image analysis failed.",
        });

        return res.end();
      }
    }

    /**
     * ------------------------------------------------------
     * WEB SEARCH STREAM
     * ------------------------------------------------------
     */

    const needsWebSearch =
      /latest|today|news|current|recent|weather|price|stock|score|live|2026/i.test(
        cleanMessage,
      );

    if (needsWebSearch) {
      console.log("[AI STREAM] 🌐 Web search request detected.");

      try {
        const webResponse = await generateWebSearchResponse(cleanMessage);

        sendEvent("chunk", {
          content: webResponse.text,
        });

        await messageQueries.create(
          activeConversationId,
          "assistant",
          webResponse.text,
        );

        sendEvent("done", {
          conversationId: activeConversationId,
          provider: "web-search",
          sources: webResponse.sources || [],
        });

        return res.end();
      } catch (webError) {
        console.error(
          "[AI STREAM] ⚠️ Web search failed:",
          webError?.message || webError,
        );

        /**
         * Continue with normal AI
         * if web search fails.
         */
      }
    }

    /**
     * ------------------------------------------------------
     * NORMAL STREAM
     * ------------------------------------------------------
     */

    let streamedText = "";

    const result = await streamWithRetry({
      genAI,
      messages,
      userMessage: cleanMessage,
      onChunk: (chunk) => {
        streamedText += chunk;

        sendEvent("chunk", {
          content: chunk,
        });
      },
    });

    /**
     * ------------------------------------------------------
     * SAVE COMPLETE ASSISTANT MESSAGE
     * ------------------------------------------------------
     */

    const finalText = cleanAIText(streamedText || result.text || "");

    if (!finalText) {
      throw new Error("AI returned an empty response.");
    }

    await messageQueries.create(activeConversationId, "assistant", finalText);

    /**
     * ------------------------------------------------------
     * LONG-TERM MEMORY (Phase 1) — ACCESS TRACKING
     * Marks only the memories that were actually injected
     * into this response's context. Best-effort only.
     * ------------------------------------------------------
     */

    try {
      await markMemoriesAccessed(userId, usedMemoryIds);
    } catch (memoryAccessError) {
      console.error(
        "[MEMORY ACCESS ERROR]",
        memoryAccessError?.message || memoryAccessError,
      );
    }

    /**
     * ------------------------------------------------------
     * DONE EVENT
     * ------------------------------------------------------
     */

    sendEvent("done", {
      conversationId: activeConversationId,

      provider: result.provider,
    });

    /**
     * ------------------------------------------------------
     * LONG-TERM MEMORY (Phase 1) — EXTRACTION
     * Runs after the complete assistant response was
     * generated, saved and announced to the client.
     * Best-effort only — must never break the stream.
     * ------------------------------------------------------
     */

    try {
      await extractAndSaveMemories({
        userId,
        userMessage: cleanMessage,
        assistantMessage: finalText,
      });
    } catch (memoryError) {
      console.error(
        "[MEMORY EXTRACTION ERROR]",
        memoryError?.message || memoryError,
      );
    }

    return res.end();
  } catch (error) {
    console.error("[AI STREAM ERROR]", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error?.message || "Streaming failed.",
      });
    }

    try {
      res.write(`event: error\n`);

      res.write(
        `data: ${JSON.stringify({
          message: error?.message || "Streaming failed.",
        })}\n\n`,
      );

      res.end();
    } catch (streamError) {
      console.error("[AI STREAM CLOSE ERROR]", streamError);

      try {
        res.end();
      } catch {}
    }
  }
});

/**
 * ============================================================
 * EXPORT ROUTER
 * ============================================================
 */

module.exports = router;
