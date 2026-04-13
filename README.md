# Nami Discord Bot

Nami is a modular Discord bot built with `discord.js` and TypeScript.

It supports:

- AI Q&A through OpenRouter for smart mode and Ollama for uncensored mode
- Chat-style replies when users mention `@Nami`
- Web search summaries using DuckDuckGo search results plus AI summarization
- Text games like guessing, trivia, scramble, rock-paper-scissors, and coinflip
- Text-to-speech in voice channels with Google Cloud Text-to-Speech
- Storage backed by local JSON or Supabase
- Per-user preferences for Google voice ID, speed, language, and AI reply style
- Per-user model mode switch (smart vs uncensored)
- Server default TTS language with per-user preference override for `/tts say` and auto voice read
- Optional auto voice reading in VC with auto-join include/exclude controls
- Admin controls for feature flags, prompts, announcements, and history cleanup

## Stack

- Node.js 22+
- TypeScript
- `discord.js`
- `@discordjs/voice`
- Ollama `/api/chat` for uncensored model chat
- OpenRouter for text generation
- DuckDuckGo HTML search for free web search results
- Google Cloud Text-to-Speech REST API
- Supabase as an optional runtime storage backend
- `node-cron` for internal keepalive scheduling

## Setup

1. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Enable `MESSAGE CONTENT INTENT` in the bot settings because mention-based chat uses message content.
3. Invite the bot with these scopes:
   - `bot`
   - `applications.commands`
4. Give it permissions such as:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Connect`
   - `Speak`
5. Copy `.env.example` to `.env` and fill in the values.

## Environment Variables

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_GUILD_ID=optional_guild_id_for_fast_dev_command_registration
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=llama3.1:8b
OLLAMA_FALLBACK_MODELS=gpt-oss:120b,gpt-oss:120b-cloud
OLLAMA_API_KEY=optional_ollama_api_key
OLLAMA_TIMEOUT_MS=30000
GOOGLE_TTS_KEY=your_google_cloud_api_key
GOOGLE_TTS_SPEAKING_RATE=1
GOOGLE_TTS_PITCH=0
TTS_MAX_CHARS=250
TTS_COOLDOWN_SECONDS=2
TTS_DAILY_USER_REQUEST_LIMIT=300
TTS_DAILY_USER_CHARACTER_LIMIT=75000
TTS_DAILY_GUILD_REQUEST_LIMIT=3000
TTS_DAILY_GUILD_CHARACTER_LIMIT=600000
TTS_DAILY_GLOBAL_REQUEST_LIMIT=12000
TTS_DAILY_GLOBAL_CHARACTER_LIMIT=2400000
SUPABASE_URL=optional_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=optional_supabase_service_role_key
USE_SUPABASE_STORAGE=false
SUPABASE_TTS_BUCKET=optional_supabase_storage_bucket_for_tts_cache
SUPABASE_TTS_BUCKET_PREFIX=tts-cache
INTERNAL_KEEPALIVE_ENABLED=false
INTERNAL_KEEPALIVE_INTERVAL_MINUTES=14
INTERNAL_KEEPALIVE_URL=optional_absolute_healthcheck_url
PORT=8080
```

Set `USE_SUPABASE_STORAGE=true` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to use Supabase for guild settings, user preferences, and conversation history. If disabled (or if keys are missing), Nami falls back to local JSON storage.

Set `SUPABASE_TTS_BUCKET` to enable Supabase Storage-backed TTS cache objects (`messages/`, `prefixes/`, `joined/`). This is recommended on Render so cache survives restarts and does not depend on ephemeral local disk. Use `SUPABASE_TTS_BUCKET_PREFIX` to namespace objects.

`GOOGLE_TTS_*` and `TTS_*` variables are used by the active runtime TTS path.

Daily TTS limit tracking is persisted in Supabase when `USE_SUPABASE_STORAGE=true` and enforced atomically to remain safe under parallel requests.

`OLLAMA_BASE_URL` and `OLLAMA_MODEL` are required for uncensored mode. Use `http://localhost:11434` (or `http://localhost:11434/api`) for local Ollama, and `https://ollama.com` for Cloud API. Set `OLLAMA_API_KEY` for protected/cloud endpoints.

Set `OLLAMA_FALLBACK_MODELS` as a comma-separated list to retry alternate models when the primary model returns "not found".

Internal keepalive cron is production-enabled by default and runs every 14 minutes. Override with `INTERNAL_KEEPALIVE_ENABLED`, `INTERNAL_KEEPALIVE_INTERVAL_MINUTES`, and optional `INTERNAL_KEEPALIVE_URL`.

`DISCORD_GUILD_ID` is optional but recommended while testing because guild commands register much faster than global commands.

## Install And Run

```bash
npm install
npm run build
npm start
```

For local development with auto-reload:

```bash
npm run dev
```

## Free Cloud Deploy (Render)

If your local IP is rate-limited or blocked by provider anti-abuse checks, deploy the bot to a cloud host so requests come from the cloud network.

1. Push this repo to GitHub.
2. In Render, create a new service using this repository.
3. Render will detect `render.yaml` and use Docker deployment automatically.
4. Add required environment variables in Render:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID` (recommended for fast command updates)
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
   - `OLLAMA_BASE_URL` (required for uncensored mode)
   - `OLLAMA_MODEL` (required for uncensored mode)
   - `OLLAMA_FALLBACK_MODELS` (optional comma-separated model retries)
   - `OLLAMA_API_KEY` (optional, required for protected endpoints)
   - `OLLAMA_TIMEOUT_MS` (optional)
   - `GOOGLE_TTS_KEY`
   - `GOOGLE_TTS_SPEAKING_RATE` (optional)
   - `GOOGLE_TTS_PITCH` (optional)
   - `TTS_MAX_CHARS` (optional)
   - `TTS_COOLDOWN_SECONDS` (optional)
   - `SUPABASE_TTS_BUCKET` (recommended on Render for persistent audio cache)
   - `SUPABASE_TTS_BUCKET_PREFIX` (optional; defaults to `tts-cache`)
   - `INTERNAL_KEEPALIVE_ENABLED=true` (optional, default true in production)
   - `INTERNAL_KEEPALIVE_INTERVAL_MINUTES=14` (optional)
   - `INTERNAL_KEEPALIVE_URL` (optional absolute URL; defaults to `/healthz` target)
   - `PORT=8080`
5. Deploy and check logs for startup messages.

Health endpoints are exposed for cloud checks:

- `/health`
- `/healthz`

Both return JSON status including bot readiness and TTS availability.

## Commands

- `/ask prompt:<text> web:<true|false>`: Ask Nami an AI question
- `@Nami your message`: Chat naturally by mentioning the bot in a server
- `/search query:<text>`: Search the web and summarize results
- `/preferences view|voice|search|language|reset`: Manage personal preferences
- `/preferences model mode:<smart|uncensored>`: Smart mode uses OpenRouter, uncensored mode uses Ollama
- `/preferences voices`: List Google TTS voices
- `/game guess-start|guess-pick|trivia|scramble|rps|coinflip`: Play text games
- `/voice join|leave|auto-read|autojoin|language`: Voice controls plus automatic VC speech options
- `/tts say|skip|clearqueue|stop|voices|info`: Speak text with Google TTS
- `/admin feature|system-prompt|announce|clear-history|set-announcements|tts-language`: Server-level management

## Notes

- Nami stores server settings, user preferences, and short chat history in Supabase when enabled, otherwise in `data/storage.json`.
- Generated live playback files are created under `data/audio`.
- When `SUPABASE_TTS_BUCKET` is set, long-lived TTS cache objects are stored in Supabase Storage and only short-lived playback temp files use local disk.
- Without `SUPABASE_TTS_BUCKET`, Google TTS cache files persist under `data/audio_cache`.
- `/tts voices` shows Google voice IDs.
- Set your preferred voice with `/preferences voice voice_id:<id>`.
- TTS speech language now uses user preference first (`/preferences language`) and falls back to server default (`/voice language` or `/admin tts-language`). Auto language detection is disabled.
- The bot now tracks and enforces daily TTS limits (user, guild, global). Configure the limits via `TTS_DAILY_*` env vars.
- Google Cloud quota reference (as of docs updated 2026-04-10): content is limited to 5,000 bytes per request, and default project request quota includes 1,000 requests/minute for standard/non-dedicated voices.
- As of April 10, 2026, OpenRouter free models can still have provider-side rate, concurrency, or credit limits. "Free" does not mean unlimited.
- Uncensored mode requires a reachable Ollama endpoint from the deployed environment. For cloud calls, use `OLLAMA_BASE_URL=https://ollama.com`; for local daemon use `OLLAMA_BASE_URL=http://localhost:11434`.
- Render free instances use ephemeral local storage. If the service is rebuilt/restarted, `data/storage.json` may reset unless you attach persistent storage or external DB.
- Slash commands are registered automatically on startup.

## Pinger Site (Vercel)

This repo includes a lightweight website in `pinger-site` that can send GET requests to your Render URL at random intervals between 1 and 10 seconds.

Deploy only that folder to Vercel:

```bash
cd pinger-site
npx vercel --prod
```


