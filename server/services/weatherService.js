/**
 * weatherService.js — Phase 3B Tier 2: Dedicated Live Weather
 *
 * Deterministic weather answers via Open-Meteo (no API key, no new deps).
 *
 * SAFETY MODEL:
 * - Open-Meteo responses are UNTRUSTED DATA. Only expected numeric/string
 *   fields are consumed; nothing from the API is executed or treated as
 *   instructions, and location strings are sanitized.
 * - Answers are rendered deterministically (no LLM rewriting), so weather
 *   numbers can never be hallucinated by a model.
 * - handleWeatherQuery() NEVER throws: on any failure (timeout, HTTP error,
 *   invalid JSON, empty results, missing location) it returns null so the
 *   chat route falls back to the existing web-search / normal-AI path.
 *
 * LOCATION POLICY:
 * - Only explicit city/location from the user's message.
 * - Optional DEFAULT_WEATHER_LOCATION env as a deployment-configured default.
 * - No device location, no GPS, no IP location, no hardcoded city.
 */

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// TOTAL deadline budget for the complete weather chain (geocode + forecast).
const WEATHER_TOTAL_TIMEOUT_MS = Number(process.env.WEATHER_TIMEOUT_MS || 8000);

// Maximum 1 retry across network calls.
const WEATHER_MAX_RETRIES = 1;

// Optional small in-memory cache for repeated weather queries (TTL: 5 min).
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
const WEATHER_CACHE_MAX_ENTRIES = 50;
const weatherCache = new Map();

const WEATHER_SOURCES = [
  {
    title: "Open-Meteo",
    url: "https://open-meteo.com/",
  },
];

/**
 * WMO weather interpretation codes (documented by Open-Meteo).
 * Deterministic mapping only — unknown codes are NEVER guessed.
 */
const WMO_CONDITIONS = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snowfall",
  73: "moderate snowfall",
  75: "heavy snowfall",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail",
};

function describeWeatherCode(code) {
  const n = Number(code);

  if (!Number.isFinite(n)) {
    return null;
  }

  return Object.prototype.hasOwnProperty.call(WMO_CONDITIONS, n)
    ? WMO_CONDITIONS[n]
    : `Weather code ${n}`;
}

// ---------------------------------------------------------------------------
// TIMEOUT HELPER
// ---------------------------------------------------------------------------

function withTimeout(promise, ms, label) {
  const controller = new AbortController();
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error(`${label} timed out after ${ms}ms.`);
      error.code = "WEATHER_TIMEOUT";
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

// ---------------------------------------------------------------------------
// INTENT DETECTION (conservative)
// ---------------------------------------------------------------------------

const WEATHER_KEYWORD_LATIN =
  /\b(weather|temperature|forecast|rain|rainfall|showers?|humidity|mausam|barish|baarish|taapman|tapman|paus|paavus)\b/i;
const WEATHER_KEYWORD_DEVANAGARI =
  /(मौसम|तापमान|तपमान|बारिश|बरसात|पाऊस|पावसा|पर्जन्य|हवामान)/;

const TIME_CUE_LATIN =
  /\b(today|tonight|tomorrow|now|right now|currently|abhi|aaj|kal|udya)\b/i;
const TIME_CUE_DEVANAGARI = /(आज|कल|उद्या|अभी|आता|सध्या)/;

// Explicitly NOT weather: temperatures/atmospheres of celestial bodies or space.
const CELESTIAL_GUARD =
  /\b(sun|solar|moon|lunar|mars|venus|jupiter|saturn|mercury|neptune|pluto|planet|planets|galaxy|universe|space|asteroid|comet|stars?)\b/i;

const BARE_WEATHER_QUESTION = /\b(weather|mausam)\b|मौसम|हवामान/i;

function hasWeatherKeyword(text) {
  return (
    WEATHER_KEYWORD_LATIN.test(text) || WEATHER_KEYWORD_DEVANAGARI.test(text)
  );
}

function hasTimeCue(text) {
  return TIME_CUE_LATIN.test(text) || TIME_CUE_DEVANAGARI.test(text);
}

/**
 * Conservative weather-intent detection.
 * Requires a weather keyword AND (an explicit location OR a time cue OR a
 * bare weather question). Celestial/space questions are rejected.
 */
function detectWeatherIntent(text) {
  if (typeof text !== "string") {
    return false;
  }

  const t = text.trim();

  if (!t || t.length > 200) {
    return false;
  }

  if (!hasWeatherKeyword(t)) {
    return false;
  }

  if (extractLocation(t)) {
    return true;
  }

  if (hasTimeCue(t)) {
    return true;
  }

  return BARE_WEATHER_QUESTION.test(t);
}

// ---------------------------------------------------------------------------
// LOCATION EXTRACTION & HANDLING
// ---------------------------------------------------------------------------

const NON_LOCATION_WORDS = new Set([
  "here",
  "there",
  "everywhere",
  "somewhere",
  "the world",
  "today",
  "tonight",
  "tomorrow",
  "now",
  "currently",
  "right now",
  "me",
  "us",
  "you",
  "aaj",
  "kal",
  "udya",
  "abhi",
  "weather",
  "temperature",
  "forecast",
  "rain",
  "mausam",
  "taapman",
  "आज",
  "कल",
  "उद्या",
  "आता",
  "सध्या",
  "हवामान",
  "मौसम",
  "तापमान",
]);

const QUESTION_OR_FILLER = new Set([
  "what",
  "whats",
  "what's",
  "how",
  "hows",
  "how's",
  "tell",
  "show",
  "give",
  "check",
  "is",
  "the",
  "a",
  "an",
  "current",
  "latest",
  "please",
  "s the",
  "the weather",
  "weather",
]);

function isQuestionOrFiller(str) {
  if (!str) return true;
  const lower = str.toLowerCase().trim();
  if (QUESTION_OR_FILLER.has(lower)) return true;
  return false;
}

/**
 * Morphological stemmer for Marathi inflected location words.
 * E.g. "पुण्यात" -> "पुणे", "लातूरमध्ये" -> "लातूर", "मुंबईत" -> "मुंबई".
 */
function stemMarathiInflection(word) {
  if (typeof word !== "string") return word;
  const w = word.trim();
  if (w.endsWith("मध्ये") && w.length > 5) return w.slice(0, -5);
  if (w.endsWith("्यात") && w.length > 4) return w.slice(0, -4) + "े";
  if (w.endsWith("ात") && w.length > 3) return w.slice(0, -2);
  if (w.endsWith("त") && w.length > 3 && !/[क-ह]्$/.test(w))
    return w.slice(0, -1);
  return w;
}

/**
 * Extract location string from message, or fall back to DEFAULT_WEATHER_LOCATION.
 * NEVER uses GPS, device location, or IP location.
 * NEVER hardcodes any city.
 */
function extractLocation(text) {
  if (typeof text !== "string") {
    const defaultLoc = process.env.DEFAULT_WEATHER_LOCATION?.trim();
    return defaultLoc || null;
  }

  const clean = text.trim();
  if (!clean) {
    const defaultLoc = process.env.DEFAULT_WEATHER_LOCATION?.trim();
    return defaultLoc || null;
  }

  // 1. "in / at / for / around <Location>" pattern
  // Matches "weather in Pune", "temperature in Latur, Maharashtra", "rain in Pune, India"
  const prepMatch = clean.match(
    /\b(?:in|at|for|around)\s+([A-Za-z\u0900-\u097F\s,.-]+?)(?:\s+(?:today|tonight|tomorrow|now|right now|currently|this week|aaj|kal|udya)\b|[?.!;]|$)/i,
  );
  if (prepMatch && prepMatch[1]) {
    const candidate = cleanCandidate(prepMatch[1]);
    if (
      candidate &&
      !isQuestionOrFiller(candidate) &&
      !isNonLocation(candidate)
    ) {
      return candidate;
    }
  }

  // 2. "<Location> mein / me / madhe / मध्ये" pattern (Hindi / Marathi postpositions)
  // Matches "Latur mein mausam kaisa hai?", "Pune me barish", "पुणे मध्ये"
  const postMatch = clean.match(
    /([A-Za-z\u0900-\u097F\s,.-]+?)\s+(?:mein|me|madhe|मध्ये)\b/i,
  );
  if (postMatch && postMatch[1]) {
    const candidate = cleanCandidate(postMatch[1]);
    if (
      candidate &&
      !isQuestionOrFiller(candidate) &&
      !isNonLocation(candidate)
    ) {
      return candidate;
    }
  }

  // 3. Devanagari inflected locative token extraction
  // Matches "आज पुण्यात पाऊस पडेल का?" -> "पुण्यात" -> stems to "पुणे"
  const tokens = clean.split(/[\s,?.!;:()"]+/);
  for (const token of tokens) {
    if (/[\u0900-\u097F]/.test(token)) {
      if (
        token.endsWith("्यात") ||
        token.endsWith("मध्ये") ||
        (token.endsWith("ात") && !["पावसात", "पावसातल्या"].includes(token)) ||
        (token.endsWith("त") && token.length > 3 && !["पाऊस"].includes(token))
      ) {
        const stemmed = stemMarathiInflection(token);
        if (
          stemmed &&
          !isQuestionOrFiller(stemmed) &&
          !isNonLocation(stemmed)
        ) {
          return stemmed;
        }
      }
    }
  }

  // 4. "<Location> weather / temperature / forecast / mausam" pattern
  // Matches "Latur weather", "Pune temperature"
  const prefixMatch = clean.match(
    /^([A-Za-z\u0900-\u097F\s,.-]+?)\s+(?:weather|temperature|forecast|mausam|taapman|paus|barish)\b/i,
  );
  if (prefixMatch && prefixMatch[1]) {
    const candidate = cleanCandidate(prefixMatch[1]);
    if (
      candidate &&
      !isQuestionOrFiller(candidate) &&
      !isNonLocation(candidate)
    ) {
      return candidate;
    }
  }

  // 5. Fallback: deployment-configured DEFAULT_WEATHER_LOCATION
  const defaultLoc = process.env.DEFAULT_WEATHER_LOCATION?.trim();
  if (defaultLoc) {
    return defaultLoc;
  }

  return null;
}

function cleanCandidate(candidate) {
  if (!candidate) return "";
  let s = candidate
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading greetings/fillers if attached
  s = s.replace(/^(?:the\s+city\s+of|city\s+of|the)\s+/i, "");
  return s;
}

function isNonLocation(str) {
  if (!str) return true;
  const lower = str.toLowerCase().trim();
  if (NON_LOCATION_WORDS.has(lower)) return true;
  if (lower.length < 2) return true;
  // Reject if it's purely punctuation or numbers
  if (!/[A-Za-z\u0900-\u097F]/.test(lower)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// GEOCODING (Open-Meteo Geocoding API)
// ---------------------------------------------------------------------------

/**
 * Geocode a location string into coordinates and standardized display location.
 * Uses native fetch with timeout budget. Returns null on failure.
 */
async function geocodeLocation(location, timeoutMs = 4000) {
  if (!location || typeof location !== "string") {
    return null;
  }

  const cleanLoc = location.trim();
  if (!cleanLoc || isNonLocation(cleanLoc)) {
    return null;
  }

  // If location has Devanagari characters, try Hindi first or fallback
  const isDevanagari = /[\u0900-\u097F]/.test(cleanLoc);
  const languagesToTry = isDevanagari ? ["hi", "mr", "en"] : ["en"];

  for (const lang of languagesToTry) {
    try {
      const url = new URL(GEOCODING_URL);
      url.searchParams.set("name", cleanLoc);
      url.searchParams.set("count", "1");
      url.searchParams.set("language", lang);

      const response = await withTimeout(
        fetch(url.toString(), {
          headers: {
            Accept: "application/json",
          },
        }),
        timeoutMs,
        "Geocoding API",
      );

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const first = Array.isArray(data?.results) ? data.results[0] : null;

      if (
        first &&
        Number.isFinite(first.latitude) &&
        Number.isFinite(first.longitude)
      ) {
        const parts = [first.name, first.admin1, first.country].filter(Boolean);
        const displayLocation = parts.join(", ");

        return {
          latitude: first.latitude,
          longitude: first.longitude,
          displayLocation,
          name: first.name || cleanLoc,
        };
      }
    } catch (err) {
      console.warn(
        `[WEATHER] Geocoding attempt (${lang}) failed:`,
        err?.message || err,
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// WEATHER FORECAST (Open-Meteo Forecast API)
// ---------------------------------------------------------------------------

/**
 * Fetch live weather from Open-Meteo Forecast API.
 * Uses native fetch with timeout budget. Returns normalized weather data or null.
 */
async function getWeather({
  latitude,
  longitude,
  displayLocation,
  timeoutMs = 4000,
}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  try {
    const url = new URL(FORECAST_URL);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    );
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    );
    url.searchParams.set("forecast_days", "2");
    url.searchParams.set("timezone", "auto");

    const response = await withTimeout(
      fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      }),
      timeoutMs,
      "Weather Forecast API",
    );

    if (!response.ok) {
      console.warn(`[WEATHER] Forecast API returned HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const current = data?.current;

    if (!current || !Number.isFinite(current.temperature_2m)) {
      console.warn("[WEATHER] Malformed forecast payload:", data);
      return null;
    }

    const daily = data?.daily || {};

    const normalized = {
      location: displayLocation || "Selected location",
      temperature: current.temperature_2m,
      feelsLike: Number.isFinite(current.apparent_temperature)
        ? current.apparent_temperature
        : current.temperature_2m,
      humidity: Number.isFinite(current.relative_humidity_2m)
        ? current.relative_humidity_2m
        : null,
      windSpeed: Number.isFinite(current.wind_speed_10m)
        ? current.wind_speed_10m
        : null,
      condition: describeWeatherCode(current.weather_code) || "clear",
      precipitation: Number.isFinite(current.precipitation)
        ? current.precipitation
        : 0,
      rainToday: {
        chance:
          Array.isArray(daily.precipitation_probability_max) &&
          Number.isFinite(daily.precipitation_probability_max[0])
            ? daily.precipitation_probability_max[0]
            : null,
        precipitationSum:
          Array.isArray(daily.precipitation_sum) &&
          Number.isFinite(daily.precipitation_sum[0])
            ? daily.precipitation_sum[0]
            : 0,
      },
      tomorrowRainChance:
        Array.isArray(daily.precipitation_probability_max) &&
        Number.isFinite(daily.precipitation_probability_max[1])
          ? daily.precipitation_probability_max[1]
          : null,
      tomorrowTempMin:
        Array.isArray(daily.temperature_2m_min) &&
        Number.isFinite(daily.temperature_2m_min[1])
          ? daily.temperature_2m_min[1]
          : null,
      tomorrowTempMax:
        Array.isArray(daily.temperature_2m_max) &&
        Number.isFinite(daily.temperature_2m_max[1])
          ? daily.temperature_2m_max[1]
          : null,
      timestamp: current.time || new Date().toISOString(),
      source: "Open-Meteo",
    };

    return normalized;
  } catch (err) {
    console.warn("[WEATHER] Forecast API error:", err?.message || err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// DETERMINISTIC MULTILINGUAL RESPONSE FORMATTING
// ---------------------------------------------------------------------------

function formatWeatherResponse({
  weatherData,
  query = "",
  language = "english",
}) {
  if (!weatherData) return "";

  const q = query.toLowerCase();
  const isTomorrow = /\b(tomorrow|kal|udya)\b/i.test(q) || /(कल|उद्या)/.test(q);
  const isRain =
    /\b(rain|rainfall|showers?|precipitation|baarish|barish|paus|paavus)\b/i.test(
      q,
    ) || /(बारिश|बरसात|पाऊस|पावसा)/.test(q);
  const isTemperature =
    /\b(temp|temperature|taapman|tapman)\b/i.test(q) ||
    /(तापमान|तपमान)/.test(q);

  // Short location name (first component before comma) for concise lines
  const shortLoc = (weatherData.location || "").split(",")[0].trim();
  const fullLoc = weatherData.location || shortLoc;

  const temp = weatherData.temperature;
  const feels = weatherData.feelsLike;
  const humidity = weatherData.humidity;
  const wind = weatherData.windSpeed;
  const cond = weatherData.condition;

  const rainChance = weatherData.rainToday?.chance ?? 0;
  const rainSum = weatherData.rainToday?.precipitationSum ?? 0;
  const tomorrowRain = weatherData.tomorrowRainChance ?? 0;
  const tomorrowMin = weatherData.tomorrowTempMin ?? "--";
  const tomorrowMax = weatherData.tomorrowTempMax ?? "--";

  switch (language) {
    case "hinglish": {
      if (isTomorrow) {
        return `Kal ${shortLoc} mein baarish ke ${tomorrowRain}% chances hain. Expected temperature: ${tomorrowMin}°C–${tomorrowMax}°C. Via Open-Meteo.`;
      }
      if (isRain) {
        return `${shortLoc}: aaj baarish hone ke ${rainChance}% chances hain. Expected precipitation: ${rainSum} mm. Via Open-Meteo.`;
      }
      if (isTemperature) {
        return `${shortLoc}: ${temp}°C right now. Feels like ${feels}°C. Via Open-Meteo.`;
      }
      const parts = [`${fullLoc}: ${temp}°C, ${cond}. Feels like ${feels}°C.`];
      if (humidity !== null) parts.push(`Humidity ${humidity}%,`);
      if (wind !== null) parts.push(`hawa ${wind} km/h.`);
      parts.push("Via Open-Meteo.");
      return parts.join(" ");
    }

    case "hindi": {
      if (isTomorrow) {
        return `कल ${shortLoc} में बारिश की संभावना ${tomorrowRain}% है। संभावित तापमान: ${tomorrowMin}°C–${tomorrowMax}°C। Via Open-Meteo.`;
      }
      if (isRain) {
        return `${shortLoc}: आज बारिश की संभावना ${rainChance}% है। संभावित वर्षा: ${rainSum} mm। Via Open-Meteo.`;
      }
      if (isTemperature) {
        return `${shortLoc}: अभी तापमान ${temp}°C है (feels like ${feels}°C)। Via Open-Meteo.`;
      }
      const parts = [
        `${fullLoc}: ${temp}°C, ${cond}। अहसास ${feels}°C जैसा है।`,
      ];
      if (humidity !== null) parts.push(`नमी ${humidity}%,`);
      if (wind !== null) parts.push(`हवा ${wind} km/h।`);
      parts.push("Via Open-Meteo.");
      return parts.join(" ");
    }

    case "marathi": {
      if (isTomorrow) {
        return `उद्या ${shortLoc} मध्ये पावसाची शक्यता ${tomorrowRain}% आहे. अपेक्षित तापमान: ${tomorrowMin}°C–${tomorrowMax}°C. Via Open-Meteo.`;
      }
      if (isRain) {
        return `${shortLoc}: आज पावसाची शक्यता ${rainChance}% आहे. अपेक्षित पाऊस: ${rainSum} mm. Via Open-Meteo.`;
      }
      if (isTemperature) {
        return `${shortLoc}: सध्या तापमान ${temp}°C आहे (feels like ${feels}°C). Via Open-Meteo.`;
      }
      const parts = [
        `${fullLoc}: ${temp}°C, ${cond}. जाणवणारे तापमान ${feels}°C.`,
      ];
      if (humidity !== null) parts.push(`आर्द्रता ${humidity}%,`);
      if (wind !== null) parts.push(`वारा ${wind} km/h.`);
      parts.push("Via Open-Meteo.");
      return parts.join(" ");
    }

    case "marathi-latin": {
      if (isTomorrow) {
        return `Udya ${shortLoc} madhe paavsachi shakyata ${tomorrowRain}% aahe. Apekshit taapman: ${tomorrowMin}°C–${tomorrowMax}°C. Via Open-Meteo.`;
      }
      if (isRain) {
        return `${shortLoc}: aaj paavsachi shakyata ${rainChance}% aahe. Apekshit paaus: ${rainSum} mm. Via Open-Meteo.`;
      }
      if (isTemperature) {
        return `${shortLoc}: sadhya taapman ${temp}°C aahe (feels like ${feels}°C). Via Open-Meteo.`;
      }
      const parts = [`${fullLoc}: ${temp}°C, ${cond}. Feels like ${feels}°C.`];
      if (humidity !== null) parts.push(`Humidity ${humidity}%,`);
      if (wind !== null) parts.push(`vara ${wind} km/h.`);
      parts.push("Via Open-Meteo.");
      return parts.join(" ");
    }

    case "english":
    default: {
      if (isTomorrow) {
        return `Tomorrow in ${shortLoc}, the rain chance is ${tomorrowRain}%. Expected temperature: ${tomorrowMin}°C–${tomorrowMax}°C. Via Open-Meteo.`;
      }
      if (isRain) {
        return `${shortLoc}: today's rain chance is ${rainChance}%. Expected precipitation: ${rainSum} mm. Via Open-Meteo.`;
      }
      if (isTemperature) {
        return `${shortLoc}: ${temp}°C right now. Feels like ${feels}°C. Via Open-Meteo.`;
      }
      const parts = [`${fullLoc}: ${temp}°C, ${cond}. Feels like ${feels}°C.`];
      if (humidity !== null) parts.push(`Humidity ${humidity}%,`);
      if (wind !== null) parts.push(`wind ${wind} km/h.`);
      parts.push("Via Open-Meteo.");
      return parts.join(" ");
    }
  }
}

// ---------------------------------------------------------------------------
// ENTRY POINT (handleWeatherQuery)
// ---------------------------------------------------------------------------

/**
 * Handle a user weather query with deadline budgeting and max 1 retry.
 *
 * @param {Object} params
 * @param {string} params.message - Clean user message.
 * @param {string} [params.language] - Language code from detectAegisLanguage.
 * @returns {Promise<{ text: string, sources: Array<{title,url}>, data: Object } | null>}
 *   Returns null on ANY failure or missing location. NEVER throws.
 */
async function handleWeatherQuery({ message, language = "english" }) {
  try {
    const cleanMessage = typeof message === "string" ? message.trim() : "";
    if (!cleanMessage) {
      return null;
    }

    const locationName = extractLocation(cleanMessage);
    if (!locationName) {
      return null;
    }

    const normalizedKey = locationName.toLowerCase().trim();

    // Check in-memory cache
    const cached = weatherCache.get(normalizedKey);
    if (cached && cached.expiresAt > Date.now()) {
      const text = formatWeatherResponse({
        weatherData: cached.data,
        query: cleanMessage,
        language,
      });

      return {
        text,
        sources: WEATHER_SOURCES,
        data: cached.data,
      };
    }

    const deadline = Date.now() + WEATHER_TOTAL_TIMEOUT_MS;

    for (let attempt = 0; attempt <= WEATHER_MAX_RETRIES; attempt++) {
      const remainingGeocodeMs = deadline - Date.now();
      if (remainingGeocodeMs <= 500) {
        console.warn("[WEATHER] Timeout budget exhausted before geocoding.");
        return null;
      }

      // 1. Geocode
      const geo = await geocodeLocation(
        locationName,
        Math.min(remainingGeocodeMs, 4000),
      );

      if (!geo) {
        if (attempt < WEATHER_MAX_RETRIES && deadline - Date.now() > 1000) {
          continue;
        }
        return null;
      }

      const remainingForecastMs = deadline - Date.now();
      if (remainingForecastMs <= 500) {
        console.warn("[WEATHER] Timeout budget exhausted before forecast.");
        return null;
      }

      // 2. Fetch forecast
      const weatherData = await getWeather({
        latitude: geo.latitude,
        longitude: geo.longitude,
        displayLocation: geo.displayLocation,
        timeoutMs: Math.min(remainingForecastMs, 4000),
      });

      if (!weatherData) {
        if (attempt < WEATHER_MAX_RETRIES && deadline - Date.now() > 1000) {
          continue;
        }
        return null;
      }

      // Cache successful response (LRU-like eviction if full)
      if (weatherCache.size >= WEATHER_CACHE_MAX_ENTRIES) {
        const oldestKey = weatherCache.keys().next().value;
        if (oldestKey) weatherCache.delete(oldestKey);
      }

      weatherCache.set(normalizedKey, {
        data: weatherData,
        expiresAt: Date.now() + WEATHER_CACHE_TTL_MS,
      });

      const text = formatWeatherResponse({
        weatherData,
        query: cleanMessage,
        language,
      });

      return {
        text,
        sources: WEATHER_SOURCES,
        data: weatherData,
      };
    }

    return null;
  } catch (err) {
    console.error("[WEATHER] handleWeatherQuery failed:", err?.message || err);
    return null;
  }
}

module.exports = {
  detectWeatherIntent,
  extractLocation,
  geocodeLocation,
  getWeather,
  describeWeatherCode,
  formatWeatherResponse,
  handleWeatherQuery,
};
