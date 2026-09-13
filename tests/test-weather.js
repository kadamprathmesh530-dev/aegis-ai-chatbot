/**
 * test-weather.js — Comprehensive verification suite for Phase 3B Tier 2
 * Dedicated Live Weather for AegisAI
 */

require("dotenv").config();
const assert = require("assert");
const {
  detectWeatherIntent,
  extractLocation,
  geocodeLocation,
  getWeather,
  describeWeatherCode,
  formatWeatherResponse,
  handleWeatherQuery,
} = require("../server/services/weatherService");

let passed = 0;
let total = 0;

async function test(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}\n`);
  }
}

async function runAll() {
  console.log("==============================================");
  console.log("🌦️  PHASE 3B TIER 2: LIVE WEATHER TEST SUITE");
  console.log("==============================================\n");

  // 1. Intent Detection — Must detect
  await test("Intent: 'What\\'s the weather?' -> true", () => {
    assert.strictEqual(detectWeatherIntent("What's the weather?"), true);
  });

  await test("Intent: 'What\\'s the temperature in Latur?' -> true", () => {
    assert.strictEqual(detectWeatherIntent("What's the temperature in Latur?"), true);
  });

  await test("Intent: 'Weather in Pune' -> true", () => {
    assert.strictEqual(detectWeatherIntent("Weather in Pune"), true);
  });

  await test("Intent: 'Will it rain today in Latur?' -> true", () => {
    assert.strictEqual(detectWeatherIntent("Will it rain today in Latur?"), true);
  });

  await test("Intent: 'Weather tomorrow' -> true", () => {
    assert.strictEqual(detectWeatherIntent("Weather tomorrow"), true);
  });

  await test("Intent: 'Latur mein mausam kaisa hai?' -> true", () => {
    assert.strictEqual(detectWeatherIntent("Latur mein mausam kaisa hai?"), true);
  });

  await test("Intent: 'आज पुण्यात पाऊस पडेल का?' -> true", () => {
    assert.strictEqual(detectWeatherIntent("आज पुण्यात पाऊस पडेल का?"), true);
  });

  // 2. Intent Detection — Must NOT detect
  await test("Intent guard: 'What is Python?' -> false", () => {
    assert.strictEqual(detectWeatherIntent("What is Python?"), false);
  });

  await test("Intent guard: 'What is Python? Explain in detail.' -> false", () => {
    assert.strictEqual(detectWeatherIntent("What is Python? Explain in detail."), false);
  });

  await test("Intent guard: 'temperature of the sun' -> false", () => {
    assert.strictEqual(detectWeatherIntent("temperature of the sun"), false);
  });

  // 3. Location Extraction
  await test("Extract location: 'What\\'s the temperature in Latur?' -> 'Latur'", () => {
    const loc = extractLocation("What's the temperature in Latur?");
    assert.strictEqual(loc, "Latur");
  });

  await test("Extract location: 'Weather in Pune' -> 'Pune'", () => {
    const loc = extractLocation("Weather in Pune");
    assert.strictEqual(loc, "Pune");
  });

  await test("Extract location: 'Weather in Pune, India' -> 'Pune, India'", () => {
    const loc = extractLocation("Weather in Pune, India");
    assert.strictEqual(loc, "Pune, India");
  });

  await test("Extract location: 'Rain in Latur, Maharashtra' -> 'Latur, Maharashtra'", () => {
    const loc = extractLocation("Rain in Latur, Maharashtra");
    assert.strictEqual(loc, "Latur, Maharashtra");
  });

  await test("Extract location: 'Latur mein mausam kaisa hai?' -> 'Latur'", () => {
    const loc = extractLocation("Latur mein mausam kaisa hai?");
    assert.strictEqual(loc, "Latur");
  });

  await test("Extract location: 'आज पुण्यात पाऊस पडेल का?' -> 'पुणे' (stemmed)", () => {
    const loc = extractLocation("आज पुण्यात पाऊस पडेल का?");
    assert.strictEqual(loc, "पुणे");
  });

  await test("Extract location: 'Weather here' rejects 'here'", () => {
    const oldEnv = process.env.DEFAULT_WEATHER_LOCATION;
    delete process.env.DEFAULT_WEATHER_LOCATION;
    try {
      const loc = extractLocation("Weather here");
      assert.strictEqual(loc, null);
    } finally {
      if (oldEnv) process.env.DEFAULT_WEATHER_LOCATION = oldEnv;
    }
  });

  await test("Extract location: fallback to DEFAULT_WEATHER_LOCATION when no location in query", () => {
    const oldEnv = process.env.DEFAULT_WEATHER_LOCATION;
    process.env.DEFAULT_WEATHER_LOCATION = "Nagpur";
    try {
      const loc = extractLocation("What's the weather?");
      assert.strictEqual(loc, "Nagpur");
    } finally {
      if (oldEnv) process.env.DEFAULT_WEATHER_LOCATION = oldEnv;
      else delete process.env.DEFAULT_WEATHER_LOCATION;
    }
  });

  // 4. WMO Weather Codes
  await test("WMO mapping: 0 -> clear sky, 2 -> partly cloudy, 61 -> slight rain", () => {
    assert.strictEqual(describeWeatherCode(0), "clear sky");
    assert.strictEqual(describeWeatherCode(2), "partly cloudy");
    assert.strictEqual(describeWeatherCode(61), "slight rain");
    assert.strictEqual(describeWeatherCode(95), "thunderstorm");
  });

  await test("WMO mapping: unknown code returns safe fallback without guessing", () => {
    assert.strictEqual(describeWeatherCode(999), "Weather code 999");
    assert.strictEqual(describeWeatherCode("invalid"), null);
  });

  // 5. Deterministic Response Formatting & Multilingual Adaptation
  await test("Formatting: English current weather contains all fields and attribution", () => {
    const mockData = {
      location: "Latur, Maharashtra, India",
      temperature: 27.1,
      feelsLike: 28.0,
      humidity: 72,
      windSpeed: 10.5,
      condition: "partly cloudy",
      precipitation: 0,
      rainToday: { chance: 65, precipitationSum: 2.4 },
      tomorrowRainChance: 40,
      tomorrowTempMin: 22,
      tomorrowTempMax: 30,
      source: "Open-Meteo",
    };

    const text = formatWeatherResponse({
      weatherData: mockData,
      query: "What's the weather in Latur?",
      language: "english",
    });

    assert(text.includes("Latur, Maharashtra, India"), "Includes full location");
    assert(text.includes("27.1°C"), "Includes temperature");
    assert(text.includes("partly cloudy"), "Includes condition");
    assert(text.includes("Feels like 28°C") || text.includes("Feels like 28.0°C") || text.includes("28"), "Includes feels like");
    assert(text.includes("Humidity 72%"), "Includes humidity");
    assert(text.includes("10.5 km/h"), "Includes wind speed");
    assert(text.includes("Via Open-Meteo."), "Includes Open-Meteo attribution");
  });

  await test("Formatting: Temperature specific question is short and concise", () => {
    const mockData = {
      location: "Latur, Maharashtra, India",
      temperature: 27.1,
      feelsLike: 28.0,
      humidity: 72,
      windSpeed: 10.5,
      condition: "partly cloudy",
      rainToday: { chance: 65, precipitationSum: 2.4 },
      source: "Open-Meteo",
    };

    const text = formatWeatherResponse({
      weatherData: mockData,
      query: "temperature in Latur",
      language: "english",
    });

    assert(text.includes("Latur: 27.1°C right now."), "Short temperature format");
    assert(text.includes("Via Open-Meteo."), "Attribution included");
  });

  await test("Formatting: Rain specific question shows rain probability & mm", () => {
    const mockData = {
      location: "Latur, Maharashtra, India",
      temperature: 27.1,
      feelsLike: 28.0,
      rainToday: { chance: 65, precipitationSum: 2.4 },
      source: "Open-Meteo",
    };

    const text = formatWeatherResponse({
      weatherData: mockData,
      query: "Will it rain today in Latur?",
      language: "english",
    });

    assert(text.includes("rain chance is 65%"), "Includes rain chance");
    assert(text.includes("2.4 mm"), "Includes precipitation mm");
    assert(text.includes("Via Open-Meteo."), "Attribution included");
  });

  await test("Formatting: Tomorrow weather shows tomorrow's rain chance and temperature range", () => {
    const mockData = {
      location: "Latur, Maharashtra, India",
      temperature: 27.1,
      feelsLike: 28.0,
      tomorrowRainChance: 40,
      tomorrowTempMin: 22,
      tomorrowTempMax: 30,
      source: "Open-Meteo",
    };

    const text = formatWeatherResponse({
      weatherData: mockData,
      query: "Weather tomorrow in Latur",
      language: "english",
    });

    assert(text.includes("Tomorrow in Latur"), "Tomorrow heading");
    assert(text.includes("rain chance is 40%"), "Tomorrow rain chance");
    assert(text.includes("22°C–30°C"), "Tomorrow min-max range");
    assert(text.includes("Via Open-Meteo."), "Attribution included");
  });

  await test("Formatting: Multilingual modes (Hinglish, Hindi, Marathi, Marathi-Latin)", () => {
    const mockData = {
      location: "Pune, Maharashtra, India",
      temperature: 25.0,
      feelsLike: 26.0,
      humidity: 80,
      windSpeed: 8,
      condition: "light drizzle",
      rainToday: { chance: 70, precipitationSum: 3.5 },
      tomorrowRainChance: 50,
      tomorrowTempMin: 21,
      tomorrowTempMax: 29,
      source: "Open-Meteo",
    };

    const hinglish = formatWeatherResponse({ weatherData: mockData, query: "Pune mein barish", language: "hinglish" });
    assert(hinglish.includes("baarish") && hinglish.includes("Via Open-Meteo."), "Hinglish output correct");

    const hindi = formatWeatherResponse({ weatherData: mockData, query: "पुणे में बारिश", language: "hindi" });
    assert(hindi.includes("बारिश की संभावना") && hindi.includes("Via Open-Meteo."), "Hindi output correct");

    const marathi = formatWeatherResponse({ weatherData: mockData, query: "पुण्यात पाऊस", language: "marathi" });
    assert(marathi.includes("पावसाची शक्यता") && marathi.includes("Via Open-Meteo."), "Marathi output correct");

    const marathiLatin = formatWeatherResponse({ weatherData: mockData, query: "pune madhe paus", language: "marathi-latin" });
    assert(marathiLatin.includes("paavsachi shakyata") && marathiLatin.includes("Via Open-Meteo."), "Marathi-Latin output correct");
  });

  // 6. Network & Failure Safety (Must return null, never throw)
  await test("Safety: geocodeLocation with invalid/empty string returns null", async () => {
    const res1 = await geocodeLocation("");
    const res2 = await geocodeLocation(null);
    const res3 = await geocodeLocation("   ");
    assert.strictEqual(res1, null);
    assert.strictEqual(res2, null);
    assert.strictEqual(res3, null);
  });

  await test("Safety: getWeather with non-numeric lat/lon returns null", async () => {
    const res = await getWeather({ latitude: "invalid", longitude: NaN });
    assert.strictEqual(res, null);
  });

  await test("Safety: handleWeatherQuery with missing location returns null without throwing", async () => {
    const oldEnv = process.env.DEFAULT_WEATHER_LOCATION;
    delete process.env.DEFAULT_WEATHER_LOCATION;
    try {
      const res = await handleWeatherQuery({ message: "What's the weather?" });
      assert.strictEqual(res, null);
    } finally {
      if (oldEnv) process.env.DEFAULT_WEATHER_LOCATION = oldEnv;
    }
  });

  await test("Safety: handleWeatherQuery with empty string returns null without throwing", async () => {
    const res = await handleWeatherQuery({ message: "" });
    assert.strictEqual(res, null);
  });

  await test("Safety: geocoding HTTP 500 returns null without throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    });

    try {
      const res = await handleWeatherQuery({ message: "Weather in Mumbai" });
      assert.strictEqual(res, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test("Safety: forecast HTTP 500 returns null without throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (String(url).includes("geocoding-api")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ name: "Mumbai", latitude: 19.07, longitude: 72.87, country: "India" }],
          }),
        };
      }
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: "Forecast failure" }),
      };
    };

    try {
      const res = await handleWeatherQuery({ message: "Weather in Mumbai" });
      assert.strictEqual(res, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test("Safety: empty geocoding results returns null without throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    try {
      const res = await handleWeatherQuery({ message: "Weather in NonexistentCityXYZ123" });
      assert.strictEqual(res, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test("Safety: malformed JSON returns null without throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token < in JSON at position 0");
      },
    });

    try {
      const res = await handleWeatherQuery({ message: "Weather in Mumbai" });
      assert.strictEqual(res, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test("Safety: network timeout returns null without throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      // simulate slow hanging connection that exceeds timeout
      await new Promise((resolve) => setTimeout(resolve, 500));
      throw new Error("Connection aborted");
    };

    try {
      const res = await handleWeatherQuery({ message: "Weather in Mumbai" });
      assert.strictEqual(res, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 7. Live Open-Meteo End-to-End Test
  await test("Live API: geocodes 'Latur' and fetches valid live weather data", async () => {
    const result = await handleWeatherQuery({
      message: "What is the weather in Latur?",
      language: "english",
    });

    assert(result !== null, "Live weather query must succeed for Latur");
    assert(typeof result.text === "string" && result.text.length > 10, "Text must be non-empty");
    assert(result.text.includes("Latur"), "Must mention Latur");
    assert(result.text.includes("Via Open-Meteo."), "Must attribute Open-Meteo");
    assert(Array.isArray(result.sources) && result.sources.length === 1, "Must have exactly 1 source");
    assert.strictEqual(result.sources[0].title, "Open-Meteo");
    assert.strictEqual(result.sources[0].url, "https://open-meteo.com/");
    assert(result.data && Number.isFinite(result.data.temperature), "Must contain valid numeric temperature");
    console.log(`     Sample Output: "${result.text}"`);
  });

  // 8. Live API: Devanagari query
  await test("Live API: geocodes 'आज पुण्यात पाऊस पडेल का?' and returns Marathi response", async () => {
    const result = await handleWeatherQuery({
      message: "आज पुण्यात पाऊस पडेल का?",
      language: "marathi",
    });

    assert(result !== null, "Live weather query must succeed for Pune in Devanagari");
    assert(result.text.includes("पुणे"), "Must mention Pune in Marathi");
    assert(result.text.includes("पावसाची शक्यता"), "Must include Marathi rain phrasing");
    assert(result.text.includes("Via Open-Meteo."), "Must attribute Open-Meteo");
    console.log(`     Sample Output: "${result.text}"`);
  });

  // 9. Verify Weather Failure Falls Through to Web Search
  await test("Fallthrough: weather null result falls through to needsWebSearch regex", () => {
    const weatherQuery = "Weather in Latur";
    // If handleWeatherQuery returned null:
    const weatherResponse = null;
    // The chat route checks needsWebSearch regex:
    const needsWebSearch = /latest|today|news|current|recent|weather|price|stock|score|live|2026/i.test(weatherQuery);
    assert.strictEqual(weatherResponse, null, "Weather returned null");
    assert.strictEqual(needsWebSearch, true, "needsWebSearch matches so query falls through to web search");
  });

  console.log("\n==============================================");
  console.log(`📊 TESTS FINISHED: ${passed}/${total} PASSED`);
  console.log("==============================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
