const DEFAULT_TARGET_URL = "https://nami-discord-bot.onrender.com/health";
const MIN_DELAY_SECONDS = 1;
const MAX_DELAY_SECONDS = 10;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const targetUrl = process.env.PINGER_TARGET_URL || DEFAULT_TARGET_URL;
  const delaySeconds = randomIntInclusive(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS);

  await sleep(delaySeconds * 1000);

  let ok = false;
  let statusCode = null;
  let errorMessage = null;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "user-agent": "nami-vercel-pinger/1.0"
      }
    });

    statusCode = response.status;
    // Any non-5xx response confirms the service was reached.
    ok = response.status < 500;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const payload = {
    ok,
    trigger: req.headers["x-vercel-cron"] ? "cron" : "manual",
    targetUrl,
    delaySeconds,
    statusCode,
    errorMessage,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt
  };

  res.status(ok ? 200 : 502).json(payload);
}