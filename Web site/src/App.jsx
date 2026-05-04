import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Compass, Anchor, Map, Ship, Zap, Terminal,
  Mic, Brain, Shield, Gamepad2, RefreshCw,
  Sparkles, Volume2, MessageCircle, Settings
} from "lucide-react";

import namiGif from "../assets/nami-hero.gif";
import opGif from "../assets/op-scene.gif";
import { Reveal } from "./components/Reveal.jsx";

import {
  CAPABILITY_CARDS,
  WORKFLOW_SYSTEMS,
  METRIC_CARDS
} from "./data/site-content.js";
import { useLiveStatus } from "./hooks/useLiveStatus.js";

const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1492125932943708350&permissions=8&integration_type=0&scope=bot%20applications.commands";

const SKETCHFAB_URL =
  "https://sketchfab.com/models/5a17d8fbb222436b90ca3cee64bd81f5/embed?autostart=1&transparent=1&ui_theme=dark&ui_infos=0&ui_controls=0&ui_stop=0&ui_watermark=0&ui_watermark_link=0";

/* ---- Icon map for workflow sections ---- */
const SYSTEM_ICONS = {
  ai: Brain,
  voice: Mic,
  memory: Gamepad2,
  admin: Shield
};

/* Quick feature highlights for minimal mode */
const MINIMAL_FEATURES = [
  { icon: Brain, title: "AI Chat", desc: "Natural mention chat + /ask with web search" },
  { icon: Volume2, title: "Voice & TTS", desc: "Queue-aware TTS, auto-read, voice profiles" },
  { icon: MessageCircle, title: "Memory", desc: "Conversation context across threads" },
  { icon: Gamepad2, title: "Games", desc: "Trivia, scramble, community rounds" },
  { icon: Shield, title: "Admin", desc: "Feature toggles, announcements, messaging" },
  { icon: Settings, title: "Config", desc: "Per-user defaults for style & language" }
];

/* ========================================
   App Component
   ======================================== */
export default function App() {
  const [isMinimal, setIsMinimal] = useState(false);
  const { status, refreshStatus } = useLiveStatus();
  const [navScrolled, setNavScrolled] = useState(false);

  /* Detect scroll for sticky nav styling */
  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const statusColor = (state) => {
    if (state === "Online") return "online";
    if (state === "Checking") return "checking";
    return "offline";
  };

  return (
    <div className="app-root">
      {/* ---- 3D Background (Thousand Sunny Sketchfab) ---- */}
      <div className="bg-3d" aria-hidden="true">
        <iframe
          title="Thousand Sunny Background"
          src={SKETCHFAB_URL}
          allow="autoplay; fullscreen; xr-spatial-tracking"
        />
      </div>
      <div className="bg-overlay" aria-hidden="true" />

      {/* ---- Content ---- */}
      <div className="content-layer">

        {/* ========== Navigation ========== */}
        <header className={`nav-bar${navScrolled ? " scrolled" : ""}${isMinimal ? " nav-minimal" : ""}`}>
          <a href="#top" className="brand">
            <Compass className="brand-icon" size={28} />
            <span className="brand-name">
              Nami<span className="brand-dot">.</span>
            </span>
          </a>

          {/* Nav links — hidden in minimal mode via CSS */}
          <nav className="nav-center">
            <a href="#features" className="nav-link">Log Pose</a>
            <a href="#commands" className="nav-link">Grand Line</a>
            <a href="#status" className="nav-link">Ship Status</a>
          </nav>

          <div className="nav-right">
            <div className="mode-toggle">
              <button
                className={`toggle-btn ${isMinimal ? "active" : ""}`}
                onClick={() => setIsMinimal(true)}
              >
                Minimal
              </button>
              <button
                className={`toggle-btn ${!isMinimal ? "active" : ""}`}
                onClick={() => setIsMinimal(false)}
              >
                Detailed
              </button>
            </div>
          </div>
        </header>

        {/* ========== Hero ========== */}
        <section className="hero" id="top">
          <div className="section-container">
            <motion.div
              className="hero-inner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              {/* Left: Text */}
              <motion.div
                className="hero-text"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                <div className="hero-eyebrow">
                  <span className="hero-eyebrow-dot" />
                  Navigator Class Discord Bot
                </div>
                <h1>
                  Chart your<br />
                  <span className="text-gradient">server's course.</span>
                </h1>
                <p className="hero-subtitle">
                  Nami is your elite navigator — run AI chat, voice, search, 
                  and server ops seamlessly from one bot. Built for communities 
                  that demand a premium, uninterrupted voyage.
                </p>
                <div className="hero-actions">
                  <a
                    href={INVITE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                  >
                    <Anchor size={18} /> Invite Navigator
                  </a>
                  <a href="#features" className="btn btn-secondary">
                    <Map size={18} /> Explore Features
                  </a>
                </div>
              </motion.div>

              {/* Right: Nami GIF Portrait */}
              <motion.div
                className="hero-visual"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                <div className="hero-portrait-wrapper">
                  <img
                    src={namiGif}
                    alt="Nami — The Navigator"
                    loading="eager"
                  />
                </div>
                {/* Floating stat cards */}
                <div className="hero-float-stat top-right">
                  <strong>8+</strong>
                  Core Systems
                </div>
                <div className="hero-float-stat bottom-left">
                  <strong>24/7</strong>
                  Health Checks
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ========== Dynamic Content ========== */}
        <AnimatePresence mode="wait">
          {isMinimal ? (
            /* ---------- MINIMAL MODE ---------- */
            <motion.div
              key="minimal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="section-container minimal-view">

                {/* ---- Smooth Sailing Header with OP GIF ---- */}
                <div className="glass-card minimal-header-card">
                  <div className="minimal-header-content">
                    <div className="minimal-header-text">
                      <h2>
                        <span className="text-gradient">Smooth Sailing</span>
                      </h2>
                      <p>
                        No clutter — just the essentials. Nami handles the undercurrents so you can focus on the horizon.
                      </p>

                      {/* Quick status pill */}
                      <div className="minimal-status-row">
                        <div className="minimal-status-pill">
                          <span className="minimal-status-label">Status</span>
                          <span className={`status-value ${statusColor(status.state)}`}>
                            {status.state}
                          </span>
                        </div>
                        <div className="minimal-status-pill">
                          <span className="minimal-status-label">Uptime</span>
                          <span className="minimal-status-val">{status.uptime}</span>
                        </div>
                        <div className="minimal-status-pill">
                          <span className="minimal-status-label">Latency</span>
                          <span className="minimal-status-val">{status.elapsed}</span>
                        </div>
                        <div className="minimal-status-pill">
                          <span className="minimal-status-label">TTS</span>
                          <span className="minimal-status-val">{status.ttsReady}</span>
                        </div>
                      </div>
                    </div>

                    {/* OP Scene GIF */}
                    <div className="minimal-header-gif">
                      <img src={opGif} alt="One Piece Scene" />
                    </div>
                  </div>
                </div>

                {/* ---- Feature Highlights Grid ---- */}
                <div className="glass-card minimal-card">
                  <h3 className="minimal-section-title">
                    <Sparkles size={18} /> What Nami Can Do
                  </h3>
                  <div className="minimal-features-grid">
                    {MINIMAL_FEATURES.map((feat) => {
                      const Icon = feat.icon;
                      return (
                        <div key={feat.title} className="minimal-feature-item">
                          <div className="minimal-feature-icon">
                            <Icon size={18} />
                          </div>
                          <div>
                            <div className="minimal-feature-name">{feat.title}</div>
                            <div className="minimal-feature-desc">{feat.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ---- All Commands Quick View ---- */}
                <div className="glass-card minimal-card">
                  <h3 className="minimal-section-title">
                    <Terminal size={18} /> Command Reference
                  </h3>
                  <p className="minimal-section-subtitle">
                    Every command Nami responds to, organized by system.
                  </p>
                  <div className="minimal-commands-grid">
                    {WORKFLOW_SYSTEMS.map((sys) => {
                      const IconComp = SYSTEM_ICONS[sys.id] || Terminal;
                      return (
                        <div key={sys.id} className="minimal-cmd">
                          <div className="minimal-cmd-header">
                            <IconComp size={14} className="minimal-cmd-icon" />
                            <span className="minimal-cmd-title">{sys.label}</span>
                            <span className="minimal-cmd-badge">{sys.badge}</span>
                          </div>
                          <div className="minimal-cmd-tags">
                            {sys.commands.map((cmd) => (
                              <div key={cmd.command} className="minimal-cmd-entry">
                                <span className="minimal-cmd-tag">
                                  {cmd.command.length > 50
                                    ? cmd.command.slice(0, 50) + "…"
                                    : cmd.command}
                                </span>
                                <span className="minimal-cmd-detail">{cmd.detail}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ---- Live Diagnostics Mini ---- */}
                <div className="glass-card minimal-card">
                  <div className="minimal-status-header">
                    <h3 className="minimal-section-title">
                      <Ship size={18} /> Ship Diagnostics
                    </h3>
                    <button
                      onClick={refreshStatus}
                      className="btn btn-secondary btn-sm"
                    >
                      <RefreshCw size={14} /> Recheck
                    </button>
                  </div>

                  <div className="minimal-diag-grid">
                    <div className="minimal-diag-cell">
                      <div className="minimal-diag-label">Condition</div>
                      <div className={`minimal-diag-value ${statusColor(status.state)}`}>
                        {status.state}
                      </div>
                    </div>
                    <div className="minimal-diag-cell">
                      <div className="minimal-diag-label">Response</div>
                      <div className="minimal-diag-value">{status.elapsed}</div>
                    </div>
                    <div className="minimal-diag-cell">
                      <div className="minimal-diag-label">Uptime</div>
                      <div className="minimal-diag-value">{status.uptime}</div>
                    </div>
                    <div className="minimal-diag-cell">
                      <div className="minimal-diag-label">TTS Module</div>
                      <div className="minimal-diag-value">{status.ttsReady}</div>
                    </div>
                  </div>

                  {status.checkedAt !== "--" && (
                    <p className="minimal-diag-timestamp">
                      Last checked at {status.checkedAt}
                    </p>
                  )}
                  <p className="minimal-diag-note">{status.headline}</p>
                </div>

                {/* Invite CTA */}
                <div className="minimal-cta-block">
                  <h3 className="text-gradient">Ready to Set Sail?</h3>
                  <a
                    href={INVITE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                  >
                    <Ship size={18} /> Add Nami to Discord
                  </a>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ---------- DETAILED MODE ---------- */
            <motion.div
              key="detailed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              {/* ---- Metrics ---- */}
              <section className="site-section">
                <div className="section-container">
                  <Reveal>
                    <div className="metrics-bar">
                      {METRIC_CARDS.map((card, i) => (
                        <div className="metric-cell" key={i}>
                          <div className="metric-value">{card.value}</div>
                          <div className="metric-label">{card.label}</div>
                        </div>
                      ))}
                    </div>
                  </Reveal>
                </div>
              </section>

              {/* ---- Features ---- */}
              <section className="site-section" id="features">
                <div className="section-container">
                  <Reveal>
                    <div className="section-header">
                      <span className="section-label">
                        <Zap size={14} /> Navigator Capabilities
                      </span>
                      <h2>
                        Everything your crew needs,{" "}
                        <span className="text-gradient">in one bot.</span>
                      </h2>
                      <p>
                        A complete map of Nami's skillset — from AI-powered chat
                        to voice automation and server management.
                      </p>
                    </div>
                  </Reveal>

                  <div className="features-grid">
                    {CAPABILITY_CARDS.map((card, i) => (
                      <Reveal key={card.title} delay={i * 100}>
                        <div className="glass-card feature-card">
                          <div className="feature-card-eyebrow">
                            {card.eyebrow}
                          </div>
                          <h3>{card.title}</h3>
                          <p>{card.copy}</p>
                          <ul className="feature-points">
                            {card.points.map((pt) => (
                              <li key={pt}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </div>
              </section>

              {/* ---- Commands ---- */}
              <section className="site-section" id="commands">
                <div className="section-container">
                  <Reveal>
                    <div className="section-header">
                      <span className="section-label">
                        <Terminal size={14} /> Command Reference
                      </span>
                      <h2>
                        Navigate the{" "}
                        <span className="text-gradient">Grand Line</span>
                      </h2>
                      <p>
                        Every system, every command — organized by workflow lane.
                      </p>
                    </div>
                  </Reveal>

                  <div className="glass-card-strong commands-section">
                    {WORKFLOW_SYSTEMS.map((sys, idx) => {
                      const IconComp = SYSTEM_ICONS[sys.id] || Terminal;
                      return (
                        <Reveal key={sys.id} delay={idx * 100}>
                          <div className="command-group">
                            <div className="command-group-header">
                              <div className="command-group-icon">
                                <IconComp size={18} />
                              </div>
                              <div>
                                <div className="command-group-title">
                                  {sys.label}
                                </div>
                                <div className="command-group-subtitle">
                                  {sys.kicker} — {sys.badge}
                                </div>
                              </div>
                            </div>
                            {sys.commands.map((cmd) => (
                              <div className="command-item" key={cmd.command}>
                                <span className="command-name">
                                  {cmd.command}
                                </span>
                                <span className="command-desc">
                                  {cmd.detail}
                                </span>
                              </div>
                            ))}
                          </div>
                          {idx < WORKFLOW_SYSTEMS.length - 1 && (
                            <div
                              style={{
                                borderBottom: "1px solid var(--glass-border)",
                                margin: "1.5rem 0"
                              }}
                            />
                          )}
                        </Reveal>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* ---- Status ---- */}
              <section className="site-section" id="status">
                <div className="section-container">
                  <Reveal>
                    <div className="section-header">
                      <span className="section-label">
                        <Ship size={14} /> Ship Status
                      </span>
                      <h2>
                        Live{" "}
                        <span className="text-gradient">Diagnostics</span>
                      </h2>
                      <p>
                        Real-time health checks from the engine room.
                      </p>
                    </div>
                  </Reveal>

                  <Reveal delay={100}>
                    <div className="glass-card">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "1rem",
                          marginBottom: "1.5rem"
                        }}
                      >
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                          {status.headline}
                        </p>
                        <button
                          onClick={refreshStatus}
                          className="btn btn-secondary btn-sm"
                        >
                          <RefreshCw size={14} /> Recheck
                        </button>
                      </div>

                      <div className="status-grid">
                        <div className="status-cell">
                          <div className="status-label">Condition</div>
                          <div className={`status-value ${statusColor(status.state)}`}>
                            {status.state}
                          </div>
                        </div>
                        <div className="status-cell">
                          <div className="status-label">Response Time</div>
                          <div className="status-value">{status.elapsed}</div>
                        </div>
                        <div className="status-cell">
                          <div className="status-label">Uptime</div>
                          <div className="status-value">{status.uptime}</div>
                        </div>
                        <div className="status-cell">
                          <div className="status-label">TTS Module</div>
                          <div className="status-value">{status.ttsReady}</div>
                        </div>
                      </div>

                      {status.checkedAt !== "--" && (
                        <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Last checked at {status.checkedAt}
                        </p>
                      )}
                    </div>
                  </Reveal>
                </div>
              </section>

              {/* ---- CTA ---- */}
              <section className="cta-section">
                <div className="section-container">
                  <Reveal>
                    <h2 className="text-gradient">Ready to Set Sail?</h2>
                    <p>
                      Bring the best navigator to your crew today.
                    </p>
                    <a
                      href={INVITE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{ padding: "1.25rem 3rem", fontSize: "1.1rem" }}
                    >
                      <Ship size={20} /> Add Nami to Discord
                    </a>
                  </Reveal>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========== Footer ========== */}
        <footer className="site-footer">
          <div className="section-container">
            <div className="footer-brand">
              <Compass size={20} color="var(--nami-orange)" />
              <span className="footer-brand-name">
                Nami<span style={{ color: "var(--nami-orange)" }}>.</span>
              </span>
            </div>
            <p>Forged in the Grand Line. Built for smooth sailing.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
