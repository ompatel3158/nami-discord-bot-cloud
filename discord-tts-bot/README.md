# 🔊 Discord TTS Bot — Google Cloud Text-to-Speech

A production-ready Discord TTS bot with smart caching, fallback voice chains,
language auto-detection (Hindi/Gujarati/English), queue system, and cooldowns.

---

## ⚡ Quick Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

> Also install FFmpeg (required by discord.py for audio):
> - Windows: https://ffmpeg.org/download.html → add to PATH
> - Linux: `sudo apt install ffmpeg`

### 2. Configure API keys
```bash
cp .env.example .env
# Edit .env with your actual keys
```

### 3. Get your keys
| Key | Where |
|-----|-------|
| `DISCORD_TOKEN` | https://discord.com/developers/applications → Your App → Bot → Token |
| `GOOGLE_TTS_KEY` | Google Cloud Console → APIs & Services → Credentials → Create API Key |

> Enable **Cloud Text-to-Speech API** in your Google Cloud project first.

### 4. Invite bot to server
In Discord Developer Portal → OAuth2 → URL Generator:
- Scopes: `bot`, `applications.commands`
- Bot Permissions: `Connect`, `Speak`, `Send Messages`, `Read Message History`

### 5. Run
```bash
python bot.py
```

---

## 🎮 Commands

| Command | Description |
|---------|-------------|
| `/speak <text>` | Speak text in your VC (auto-detects Hindi/Gujarati) |
| `/speak <text> language:gu` | Force Gujarati voice |
| `/speak <text> language:hi` | Force Hindi voice |
| `/skip` | Skip current audio |
| `/clearqueue` | Clear all queued messages |
| `/leave` | Bot disconnects from VC |
| `/voices hi` | List available Hindi voices |
| `/voices gu` | List available Gujarati voices |
| `/ttsinfo` | Show cache size, queue status |
| `!speak <text>` | Prefix fallback (same as slash) |

---

## 🧠 Architecture

```
Discord Message
      ↓
  Cooldown Check (2s/user)
      ↓
  Text Preprocessing
    → Remove emojis
    → Collapse repeated chars
    → Strip mentions
    → Enforce 250 char limit
      ↓
  Language Detection
    → Gujarati Unicode? → gu-IN
    → Hindi Unicode?    → hi-IN
    → Default           → hi-IN
      ↓
  Cache Check (SHA-256 hash of text+lang)
    → HIT  → play from disk
    → MISS → call Google TTS
      ↓
  Voice Fallback Chain
    → Neural2 → WaveNet → Standard
      ↓
  Save to cache / play via FFmpeg
      ↓
  Queue System (one plays, rest wait)
```

---

## 💡 Tips

- **Quota saving**: Cache saves ~50–80% of API calls. Repeated phrases (greetings, game callouts) are free after first use.
- **Gujarati Neural2**: Not always available. Bot automatically falls back to WaveNet → Standard.
- **Cache location**: `./audio_cache/` — you can delete it anytime to free disk space.
- **Rate limit**: 2 second cooldown per user prevents spam.

---

## 📁 File Structure

```
discord-tts-bot/
├── bot.py           # Discord bot, commands, queue, cooldown
├── tts_engine.py    # TTS logic, cache, fallback, language detection
├── requirements.txt
├── .env.example
├── .env             # ← your actual keys (never commit this)
└── audio_cache/     # auto-created, stores .mp3 files
```
