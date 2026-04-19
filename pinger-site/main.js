const commandGroups = [
  {
    id: "ai",
    kicker: "AI + Search",
    title: "Ask anything, get useful answers, and keep chat moving.",
    summary:
      "Nami answers naturally in-channel, summarizes web results, and keeps context with memory-aware replies.",
    commands: [
      {
        command: "/ask prompt:How do I plan a tournament? web:true",
        detail: "Get structured answers with optional live web context."
      },
      {
        command: "/search query:best Valorant warmup drills",
        detail: "Pull fast search summaries when members need up-to-date info."
      },
      {
        command: "@Nami give me a cleaner version of this announcement",
        detail: "Use mention chat for quick, natural help without command friction."
      }
    ]
  },
  {
    id: "voice",
    kicker: "Voice + TTS",
    title: "Use voice tools that feel clear, expressive, and reliable.",
    summary:
      "Nami supports expressive TTS, saved voice preferences, queue control, and practical auto-read behavior.",
    commands: [
      {
        command: "/voice join",
        detail: "Bring Nami into the active voice channel instantly."
      },
      {
        command: "/tts say text:match starts in five minutes",
        detail: "Speak announcements with preferred voice and playback speed."
      },
      {
        command: "/voice auto-read enabled:true",
        detail: "Enable automatic readouts for voice-driven server flows."
      }
    ]
  },
  {
    id: "games",
    kicker: "Games + Memory",
    title: "Keep members engaged without adding extra bots.",
    summary:
      "Nami blends utility and fun with mini-games plus conversation memory controls.",
    commands: [
      {
        command: "/game trivia",
        detail: "Start quick trivia rounds directly in chat."
      },
      {
        command: "/game scramble",
        detail: "Keep activity high with short word challenges."
      },
      {
        command: "/memory view count:12",
        detail: "Review what Nami remembers for more contextual replies."
      }
    ]
  },
  {
    id: "admin",
    kicker: "Automation + Admin",
    title: "Run server operations from one command system.",
    summary:
      "Automate announcements, channel messaging, and bot features with admin-safe controls.",
    commands: [
      {
        command: "@Nami send msg to #updates say patch notes are live",
        detail: "Send cross-channel updates with optional AI polishing."
      },
      {
        command: "/admin feature name:tts enabled:true",
        detail: "Turn major bot systems on or off per server."
      },
      {
        command: "/admin announce message:Scrims start at 9 PM",
        detail: "Broadcast important updates from one reliable path."
      }
    ]
  }
];

const targetUrlDefault = "https://nami-discord-bot.onrender.com/health";

const navToggle = document.getElementById("navToggle");
const siteNav = document.getElementById("siteNav");
const heroStage = document.getElementById("heroStage");
const yearLabel = document.getElementById("yearLabel");
const heroLiveLabel = document.getElementById("heroLiveLabel");
const heroCommandTrack = document.querySelector(".hero-command-track");

const commandTabs = document.getElementById("commandTabs");
const commandStage = document.querySelector(".command-stage");
const commandKicker = document.getElementById("commandKicker");
const commandCount = document.getElementById("commandCount");
const commandTitle = document.getElementById("commandTitle");
const commandDescription = document.getElementById("commandDescription");
const commandList = document.getElementById("commandList");

const checkStatusBtn = document.getElementById("checkStatusBtn");
const statusHeadline = document.getElementById("statusHeadline");
const targetUrlLabel = document.getElementById("targetUrlLabel");
const statusState = document.getElementById("statusState");
const botReadyState = document.getElementById("botReadyState");
const ttsReadyState = document.getElementById("ttsReadyState");
const uptimeState = document.getElementById("uptimeState");
const lastCheckedState = document.getElementById("lastCheckedState");
const statusCopy = document.getElementById("statusCopy");

let activeCommandIndex = 0;
let autoRotateTimer = null;
let statusRefreshTimer = null;

function setNavOpen(isOpen) {
  if (!siteNav || !navToggle) {
    return;
  }

  siteNav.classList.toggle("is-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
}

function renderCommandTabs() {
  if (!commandTabs) {
    return;
  }

  commandTabs.replaceChildren();

  commandGroups.forEach((group, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "command-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(index === activeCommandIndex));
    button.innerHTML = `<strong>${group.kicker}</strong><span>${group.summary}</span>`;
    button.addEventListener("click", () => {
      activeCommandIndex = index;
      updateCommandStage();
      restartCommandRotation();
    });
    commandTabs.append(button);
  });
}

function updateCommandStage() {
  if (!commandKicker || !commandCount || !commandTitle || !commandDescription || !commandList || !commandTabs) {
    return;
  }

  const group = commandGroups[activeCommandIndex];
  commandStage?.classList.add("is-switching");

  commandKicker.textContent = group.kicker;
  commandCount.textContent = `${group.commands.length} commands`;
  commandTitle.textContent = group.title;
  commandDescription.textContent = group.summary;

  commandList.replaceChildren();
  group.commands.forEach((item) => {
    const card = document.createElement("article");
    card.className = "command-item";
    card.innerHTML = `<code>${item.command}</code><p>${item.detail}</p>`;
    commandList.append(card);
  });

  [...commandTabs.children].forEach((child, index) => {
    child.setAttribute("aria-selected", String(index === activeCommandIndex));
  });

  window.setTimeout(() => {
    commandStage?.classList.remove("is-switching");
  }, 140);
}

function restartCommandRotation() {
  if (autoRotateTimer) {
    window.clearInterval(autoRotateTimer);
  }

  autoRotateTimer = window.setInterval(() => {
    activeCommandIndex = (activeCommandIndex + 1) % commandGroups.length;
    updateCommandStage();
  }, 4600);
}

function timestampLabel() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function setStatusUi({
  state,
  botReady,
  ttsReady,
  uptime,
  copy,
  targetUrl,
  headline,
  checkedAt
}) {
  if (statusState) statusState.textContent = state;
  if (botReadyState) botReadyState.textContent = botReady;
  if (ttsReadyState) ttsReadyState.textContent = ttsReady;
  if (uptimeState) uptimeState.textContent = uptime;
  if (statusCopy) statusCopy.textContent = copy;
  if (targetUrlLabel) targetUrlLabel.textContent = targetUrl || targetUrlDefault;
  if (statusHeadline) statusHeadline.textContent = headline;
  if (lastCheckedState) lastCheckedState.textContent = checkedAt || "--";
  if (heroLiveLabel) {
    heroLiveLabel.textContent = state === "Online" ? `Live status: ${state}` : state;
  }
}

function normalizeStatusPayload(response, payload) {
  const upstream = payload?.upstream && typeof payload.upstream === "object" ? payload.upstream : null;
  const ok = Boolean(payload?.ok);
  const uptimeLabel = formatUptime(upstream?.uptimeSeconds);
  const checkedAt = payload?.timestamp ? new Date(payload.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  }) : timestampLabel();

  return {
    targetUrl: payload?.targetUrl || targetUrlDefault,
    state: ok ? "Online" : "Needs attention",
    botReady: upstream?.botReady === true ? "Ready" : upstream?.botReady === false ? "Not ready" : "Unknown",
    ttsReady: upstream?.ttsEnabled === true ? "Ready" : upstream?.ttsEnabled === false ? "Unavailable" : "Unknown",
    uptime: uptimeLabel,
    copy: ok
      ? `Nami is responding cleanly. ${uptimeLabel !== "--" ? `Current live uptime is ${uptimeLabel}.` : "The endpoint responded without uptime details."}`
      : payload?.errorMessage || "The health check did not confirm a clean bot response.",
    headline: ok
      ? "Nami is responding from the live health endpoint"
      : "The latest health check needs attention",
    checkedAt
  };
}

async function callStatusApi({ instant }) {
  const query = instant ? "?manual=1&instant=1" : "?manual=1";
  const response = await fetch(`/api/cron-ping${query}`, {
    method: "GET",
    cache: "no-store"
  });

  const bodyText = await response.text();
  let payload = null;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = null;
  }

  return { response, payload, bodyText };
}

async function runStatusCheck() {
  if (!checkStatusBtn) {
    return;
  }

  setStatusUi({
    state: "Checking",
    botReady: "Checking",
    ttsReady: "Checking",
    uptime: "...",
    copy: "Checking Nami's live health endpoint.",
    targetUrl: targetUrlLabel?.textContent || targetUrlDefault,
    headline: "Checking Nami runtime and uptime data",
    checkedAt: lastCheckedState?.textContent || "--"
  });

  checkStatusBtn.disabled = true;

  try {
    const { response, payload, bodyText } = await callStatusApi({ instant: true });
    if (payload) {
      const normalized = normalizeStatusPayload(response, payload);
      setStatusUi(normalized);
    } else {
      setStatusUi({
        state: response.ok ? "Unknown" : "Request failed",
        botReady: "Unknown",
        ttsReady: "Unknown",
        uptime: "--",
        copy: bodyText || "Status endpoint returned no JSON payload.",
        targetUrl: targetUrlLabel?.textContent || targetUrlDefault,
        headline: "Status endpoint response could not be parsed",
        checkedAt: timestampLabel()
      });
    }

    if (response.ok && payload?.ok) {
      return;
    }

    const failureText = payload?.errorMessage || bodyText || "Unknown response";
    statusCopy.textContent = failureText;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatusUi({
      state: "Request failed",
      botReady: "Unknown",
      ttsReady: "Unknown",
      uptime: "--",
      copy: message,
      targetUrl: targetUrlLabel?.textContent || targetUrlDefault,
      headline: "The live status check could not complete",
      checkedAt: timestampLabel()
    });
  } finally {
    checkStatusBtn.disabled = false;
  }
}

function setupRevealObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
        }
      });
    },
    { threshold: 0.18 }
  );

  document.querySelectorAll("[data-reveal]").forEach((node) => observer.observe(node));
}

function setupHeroMotion() {
  if (!heroStage) {
    return;
  }

  heroStage.style.transform = "none";
}

function setupHeroMarquee() {
  if (!heroCommandTrack || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const items = [...heroCommandTrack.children];
  items.forEach((item) => {
    const clone = item.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    heroCommandTrack.append(clone);
  });
}

function setupNav() {
  if (!navToggle || !siteNav) {
    return;
  }

  navToggle.addEventListener("click", () => {
    const next = navToggle.getAttribute("aria-expanded") !== "true";
    setNavOpen(next);
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      setNavOpen(false);
    }
  });
}

function init() {
  if (yearLabel) {
    yearLabel.textContent = String(new Date().getFullYear());
  }

  setupNav();
  renderCommandTabs();
  updateCommandStage();
  restartCommandRotation();
  setupRevealObserver();
  setupHeroMotion();
  setupHeroMarquee();

  if (checkStatusBtn) {
    checkStatusBtn.addEventListener("click", () => {
      void runStatusCheck();
    });
  }

  if (statusRefreshTimer) {
    window.clearInterval(statusRefreshTimer);
  }

  statusRefreshTimer = window.setInterval(() => {
    void runStatusCheck();
  }, 60000);

  void runStatusCheck();
}

init();
