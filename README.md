# Nami Discord Bot

Nami is a modular Discord bot built with `discord.js` and TypeScript.

It supports:

- AI Q&A through OpenRouter for smart mode and Venice for uncensored mode
- Chat-style replies when users mention `@Nami`
- Web search summaries using DuckDuckGo search results plus AI summarization
- Text games like guessing, trivia, scramble, rock-paper-scissors, and coinflip
- Text-to-speech in voice channels with Cartesia
- Storage backed by local JSON or Supabase
- Per-user preferences for Cartesia voice ID, speed, language, and AI reply style
- Per-user model mode switch (smart vs uncensored)
- Server-level TTS language for both `/tts say` and auto voice read
- Optional auto voice reading in VC with auto-join include/exclude controls
- Admin controls for feature flags, prompts, announcements, and history cleanup

## Stack

- Node.js 22+
- TypeScript
- `discord.js`
- `@discordjs/voice`
- Venice chat completions API for uncensored model chat
- OpenRouter for text generation
- DuckDuckGo HTML search for free web search results
- Cartesia websocket TTS
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
CARTESIA_API_KEY=optional_cartesia_api_key
CARTESIA_VERSION=2026-03-01
CARTESIA_MODEL=sonic-3
CARTESIA_DEFAULT_VOICE_ID=f786b574-daa5-4673-aa0c-cbe3e8534c02
CARTESIA_MAX_BUFFER_DELAY_MS=3000
SUPABASE_URL=optional_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=optional_supabase_service_role_key
USE_SUPABASE_STORAGE=false
VENICE_API_KEY=your_venice_api_key
VENICE_MODEL=venice-uncensored
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free
INTERNAL_KEEPALIVE_ENABLED=false
INTERNAL_KEEPALIVE_INTERVAL_MINUTES=14
INTERNAL_KEEPALIVE_URL=optional_absolute_healthcheck_url
PORT=8080
```

Set `USE_SUPABASE_STORAGE=true` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to use Supabase for guild settings, user preferences, and conversation history. If disabled (or if keys are missing), Nami falls back to local JSON storage.

`CARTESIA_*` variables are used by the active runtime TTS path.

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
   - `VENICE_API_KEY` (required for uncensored mode)
   - `VENICE_MODEL` (default `venice-uncensored`)
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
   - `CARTESIA_API_KEY`
   - `CARTESIA_VERSION` (default `2026-03-01`)
   - `CARTESIA_MODEL` (default `sonic-3`)
   - `CARTESIA_DEFAULT_VOICE_ID` (optional)
   - `CARTESIA_MAX_BUFFER_DELAY_MS` (optional)
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
- `/preferences model mode:<smart|uncensored>`: Smart mode uses OpenRouter, uncensored mode uses Venice
- `/preferences voices`: List Cartesia voices
- `/game guess-start|guess-pick|trivia|scramble|rps|coinflip`: Play text games
- `/voice join|leave|auto-read|autojoin|language`: Voice controls plus automatic VC speech options
- `/tts say|stop|voices`: Speak text with Cartesia TTS
- `/admin feature|system-prompt|announce|clear-history|set-announcements|tts-language`: Server-level management

## Notes

- Nami stores server settings, user preferences, and short chat history in Supabase when enabled, otherwise in `data/storage.json`.
- Generated TTS files are created temporarily under `data/audio` and cleaned up after playback.
- `/tts voices` shows Cartesia voice IDs.
- Set your preferred voice with `/preferences voice voice_id:<id>`.
- TTS speech language now defaults to server-level Hindi. Change it with `/voice language value:<language>` or `/admin tts-language value:<language>`.
- As of April 10, 2026, OpenRouter free models can still have provider-side rate, concurrency, or credit limits. "Free" does not mean unlimited.
- Render free instances use ephemeral local storage. If the service is rebuilt/restarted, `data/storage.json` may reset unless you attach persistent storage or external DB.
- Slash commands are registered automatically on startup.

## Pinger Site (Vercel)

This repo includes a lightweight website in `pinger-site` that can send GET requests to your Render URL at random intervals between 1 and 10 seconds.

Deploy only that folder to Vercel:

```bash
cd pinger-site
npx vercel --prod
```


