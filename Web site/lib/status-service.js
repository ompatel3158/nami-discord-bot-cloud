export const DEFAULT_TARGET_URL = "https://nami-discord-bot.onrender.com/health";

const MIN_DELAY_SECONDS = 1;
const MAX_DELAY_SECONDS = 10;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function readFirstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function parseBooleanFlag(value) {
  const normalized = readFirstQueryValue(value);
  if (typeof normalized !== "string") {
    return false;
  }

  const lowered = normalized.trim().toLowerCase();
  return lowered === "1" || lowered === "true" || lowered === "yes" || lowered === "on";
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function buildStatusPayload({
  instant = false,
  trigger = "manual",
  targetUrl = process.env.PINGER_TARGET_URL || DEFAULT_TARGET_URL
} = {}) {
  const startedAt = Date.now();
  const delaySeconds = instant ? 0 : randomIntInclusive(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS);

  if (delaySeconds > 0) {
    await sleep(delaySeconds * 1000);
  }

  let ok = false;
  let statusCode = null;
  let errorMessage = null;
  let upstream = null;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "user-agent": "nami-vercel-pinger/3.0"
      }
    });

    statusCode = response.status;

    const responseText = await response.text();
    upstream = safeJsonParse(responseText);

    ok = response.ok && (upstream?.ok ?? true);

    if (!ok && !upstream && responseText) {
      upstream = {
        raw: responseText.slice(0, 240)
      };
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const payload = {
    ok,
    trigger,
    targetUrl,
    delaySeconds,
    statusCode,
    errorMessage,
    upstream,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt
  };

  return {
    payload,
    statusCode: ok ? 200 : 502
  };
}
