# Nami Discord Bot

Nami is a modular Discord bot built with `discord.js` and TypeScript.

It supports:

- AI Q&A through OpenRouter
- Chat-style replies when users mention `@Nami`
- Web search summaries using DuckDuckGo search results plus AI summarization
- Text games like guessing, trivia, scramble, rock-paper-scissors, and coinflip
- ElevenLabs text-to-speech in voice channels
- Per-user preferences for voice ID, speed, language, and AI reply style
- Per-user model mode switch (smart vs uncensored)
- Optional auto voice reading in VC with auto-join include/exclude controls
- Admin controls for feature flags, prompts, announcements, and history cleanup

## Stack

- Node.js 22+
- TypeScript
- `discord.js`
- `@discordjs/voice`
- OpenRouter for text generation
- DuckDuckGo HTML search for free web search results
- ElevenLabs for text-to-speech

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
OPENROUTER_MODEL=google/gemma-4-31b-it:free
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_API_KEY_FALLBACK=optional_backup_elevenlabs_key
ELEVENLABS_DEFAULT_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
PORT=8080
```

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
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_API_KEY_FALLBACK` (optional)
   - `ELEVENLABS_DEFAULT_VOICE_ID`
   - `ELEVENLABS_MODEL_ID`
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
- `/preferences view|voice|ai-style|search|language|reset`: Manage personal preferences
- `/preferences model mode:<smart|uncensored>`: Switch between the default smart model and uncensored Dolphin Mistral
- `/preferences voices`: List available voices and copy the voice ID quickly
- `/game guess-start|guess-pick|trivia|scramble|rps|coinflip`: Play text games
- `/voice join|leave|auto-read|autojoin`: Voice controls plus automatic VC speech options
- `/tts say|stop|voices`: Speak text with ElevenLabs voices
- `/admin feature|system-prompt|announce|clear-history|set-announcements`: Server-level management

## Notes

- Nami stores server settings, user preferences, and short chat history in `data/storage.json`.
- Generated TTS files are created temporarily under `data/audio` and cleaned up after playback.
- `/tts voices` shows the voice IDs available to your ElevenLabs account, and `/preferences voice` stores the one you want to use by default.
- As of April 10, 2026, OpenRouter free models and ElevenLabs plans can still have provider-side rate, concurrency, or credit limits. �Free� does not mean unlimited.
- Slash commands are registered automatically on startup.


