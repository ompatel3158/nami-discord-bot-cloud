const commandGroups = [
  {
    id: "ai",
    kicker: "AI + Search",
    title: "Ask, search, and keep the conversation moving.",
    summary:
      "Nami can answer directly, browse the web for summaries, and keep context through remembered server conversations.",
    commands: [
      {
        command: "/ask prompt:How do I plan a tournament? web:true",
        detail: "Answer with live web context when you need current information."
      },
      {
        command: "/search query:best Valorant warmup drills",
        detail: "Get a fast web summary with source-aware results."
      },
      {
        command: "@Nami give me a cleaner version of this announcement",
        detail: "Use mention chat for quick natural interaction in-channel."
      }
    ]
  },
  {
    id: "voice",
    kicker: "Voice + TTS",
    title: "Queue speech that sounds intentional, not robotic.",
    summary:
      "Google TTS voices, saved voice preferences, queue controls, and auto-read behavior make Nami work inside real voice channels.",
    commands: [
      {
        command: "/voice join",
        detail: "Bring Nami into your current voice channel."
      },
      {
        command: "/tts say text:match starts in five minutes",
        detail: "Generate speech with your preferred voice and speed."
      },
      {
        command: "/voice auto-read enabled:true",
        detail: "Automatically read incoming chat in supported voice flows."
      }
    ]
  },
  {
    id: "games",
    kicker: "Games + Memory",
    title: "Keep your server playful without leaving the same bot.",
    summary:
      "Nami mixes utility with fun, including trivia, scramble, guessing, rock-paper-scissors, and personal memory controls.",
    commands: [
      {
        command: "/game trivia",
        detail: "Start a trivia round inside the server chat."
      },
      {
        command: "/game scramble",
        detail: "Drop a quick word challenge between conversations."
      },
      {
        command: "/memory view count:12",
        detail: "Inspect the recent messages Nami is remembering for you."
      }
    ]
  },
  {
    id: "admin",
    kicker: "Automation + Admin",
    title: "Handle community workflows without switching tools.",
    summary:
      "Nami can send channel messages, route announcements, toggle features, and manage server-level AI and voice settings.",
    commands: [
      {
        command: "@Nami send msg to #updates say patch notes are live",
        detail: "Send cross-channel messages with optional AI cleanup."
      },
      {
        command: "/admin feature name:tts enabled:true",
        detail: "Enable or disable systems per server."
      },
      {
        command: "/admin announce message:Scrims start at 9 PM",
        detail: "Push announcements from one consistent command path."
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
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (!heroStage || prefersReducedMotion || !supportsFinePointer) {
    if (heroStage) {
      heroStage.style.transform = "none";
    }
    return;
  }

  const limit = 8;
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let frameId = 0;

  const animate = () => {
    currentX += (targetX - currentX) * 0.12;
    currentY += (targetY - currentY) * 0.12;
    heroStage.style.transform = `perspective(1200px) rotateX(${currentY}deg) rotateY(${currentX}deg) translateZ(0)`;
    frameId = window.requestAnimationFrame(animate);
  };

  frameId = window.requestAnimationFrame(animate);

  heroStage.addEventListener("pointermove", (event) => {
    const rect = heroStage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    targetY = -(y * limit);
    targetX = x * limit;
  });

  heroStage.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
  });

  window.addEventListener("beforeunload", () => {
    window.cancelAnimationFrame(frameId);
  });
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
