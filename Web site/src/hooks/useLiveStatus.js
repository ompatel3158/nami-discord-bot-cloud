import { useEffect, useState, useCallback, useRef } from "react";

const INITIAL_STATUS = {
  phase: "loading",
  state: "Checking",
  botReady: "Checking",
  ttsReady: "Checking",
  uptime: "--",
  elapsed: "--",
  statusCode: "--",
  copy: "Checking Nami's live runtime health.",
  headline: "Checking Nami runtime and uptime data",
  targetUrl: "https://nami-discord-bot.onrender.com/health",
  checkedAt: "--"
};

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

function createCheckedAtLabel(isoTimestamp) {
  if (!isoTimestamp) {
    return "--";
  }

  const date = new Date(isoTimestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeStatusPayload(payload) {
  const upstream = payload?.upstream && typeof payload.upstream === "object" ? payload.upstream : null;
  const ok = Boolean(payload?.ok);
  const uptime = formatUptime(upstream?.uptimeSeconds);

  return {
    phase: ok ? "ready" : "error",
    state: ok ? "Online" : payload?.errorMessage ? "Request failed" : "Needs attention",
    botReady: upstream?.botReady === true ? "Ready" : upstream?.botReady === false ? "Not ready" : "Unknown",
    ttsReady: upstream?.ttsEnabled === true ? "Ready" : upstream?.ttsEnabled === false ? "Unavailable" : "Unknown",
    uptime,
    elapsed: Number.isFinite(payload?.elapsedMs) ? `${payload.elapsedMs}ms` : "--",
    statusCode: payload?.statusCode ? String(payload.statusCode) : "--",
    copy: ok
      ? `Nami is responding cleanly from the live health endpoint.${uptime !== "--" ? ` Current uptime: ${uptime}.` : ""}`
      : payload?.errorMessage || "The health endpoint did not confirm a clean bot response.",
    headline: ok ? "Nami is responding from the live health endpoint" : "The latest health check needs attention",
    targetUrl: payload?.targetUrl || INITIAL_STATUS.targetUrl,
    checkedAt: createCheckedAtLabel(payload?.timestamp)
  };
}

export function useLiveStatus() {
  const [status, setStatus] = useState(INITIAL_STATUS);
  const isFetchingRef = useRef(false);

  const requestStatus = useCallback(async ({ silent = false } = {}) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    if (!silent) {
      setStatus((currentStatus) => ({
        ...currentStatus,
        phase: "loading",
        state: "Checking",
        copy: "Checking Nami's live runtime health."
      }));
    }

    try {
      const response = await fetch("/api/cron-ping?manual=1&instant=1", {
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

      if (!payload) {
        setStatus({
          phase: response.ok ? "ready" : "error",
          state: response.ok ? "Unknown" : "Request failed",
          botReady: "Unknown",
          ttsReady: "Unknown",
          uptime: "--",
          elapsed: "--",
          statusCode: String(response.status),
          copy: bodyText || "Status endpoint returned no JSON payload.",
          headline: "Status endpoint response could not be parsed",
          targetUrl: INITIAL_STATUS.targetUrl,
          checkedAt: createCheckedAtLabel(new Date().toISOString())
        });
        isFetchingRef.current = false;
        return;
      }

      setStatus(normalizeStatusPayload(payload));
    } catch (error) {
      setStatus({
        phase: "error",
        state: "Request failed",
        botReady: "Unknown",
        ttsReady: "Unknown",
        uptime: "--",
        elapsed: "--",
        statusCode: "--",
        copy: error instanceof Error ? error.message : String(error),
        headline: "The live status check could not complete",
        targetUrl: INITIAL_STATUS.targetUrl,
        checkedAt: createCheckedAtLabel(new Date().toISOString())
      });
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void requestStatus();

    const intervalId = window.setInterval(() => {
      void requestStatus({ silent: true });
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [requestStatus]);

  return {
    status,
    refreshStatus: () => requestStatus()
  };
}
