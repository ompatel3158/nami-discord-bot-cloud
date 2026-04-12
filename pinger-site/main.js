const targetUrlInput = document.getElementById("targetUrl");
const sentCountEl = document.getElementById("sentCount");
const failedCountEl = document.getElementById("failedCount");
const statusEl = document.getElementById("status");
const logListEl = document.getElementById("logList");

const triggerBtn = document.getElementById("triggerBtn");
const clearBtn = document.getElementById("clearBtn");

let sentCount = 0;
let failedCount = 0;

function setStatus(message, mode) {
  statusEl.textContent = message;
  statusEl.className = `status ${mode}`;
}

function updateCounters() {
  sentCountEl.textContent = String(sentCount);
  failedCountEl.textContent = String(failedCount);
}

function addLogLine(message, isError = false) {
  const line = document.createElement("li");
  line.className = isError ? "log-fail" : "log-ok";

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  line.textContent = `${hh}:${mm}:${ss} - ${message}`;
  logListEl.prepend(line);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function sendManualPing() {
  triggerBtn.disabled = true;
  setStatus("Sending manual ping...", "running");

  try {
    const response = await fetch("/api/cron-ping?manual=1", {
      method: "GET",
      cache: "no-store"
    });

    const bodyText = await response.text();
    const payload = safeJsonParse(bodyText);

    if (payload?.targetUrl) {
      targetUrlInput.value = payload.targetUrl;
    }

    const delayLabel = payload?.delaySeconds ? `${payload.delaySeconds}s` : "n/a";
    const statusLabel = payload?.statusCode ?? response.status;

    if (response.ok && payload?.ok) {
      sentCount += 1;
      updateCounters();
      addLogLine(`Manual ping sent. Target: ${payload.targetUrl}. Delay: ${delayLabel}. HTTP: ${statusLabel}.`);
      setStatus("Manual ping succeeded", "running");
      return;
    }

    failedCount += 1;
    updateCounters();

    const errorText = payload?.errorMessage || bodyText || "Unknown error";
    addLogLine(`Manual ping failed. HTTP: ${statusLabel}. ${errorText}`, true);
    setStatus("Manual ping failed", "error");
  } catch (error) {
    failedCount += 1;
    updateCounters();

    const message = error instanceof Error ? error.message : String(error);
    addLogLine(`Manual ping failed: ${message}`, true);
    setStatus("Manual ping failed", "error");
  } finally {
    triggerBtn.disabled = false;
  }
}

triggerBtn.addEventListener("click", sendManualPing);
clearBtn.addEventListener("click", () => {
  logListEl.replaceChildren();
});

setStatus("Background auto ping runs via GitHub Actions.", "idle");
updateCounters();
