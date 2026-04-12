# Nami Discord Bot

Nami is a modular Discord bot built with `discord.js` and TypeScript.

It supports:

- AI Q&A through OpenRouter for smart mode and Venice for uncensored mode
- Chat-style replies when users mention `@Nami`
- Web search summaries using DuckDuckGo search results plus AI summarization
- Text games like guessing, trivia, scramble, rock-paper-scissors, and coinflip
- Text-to-speech in voice channels with ElevenLabs primary + Gemini (Google) fallback
- Per-user preferences for ElevenLabs voice ID, Google voice name, speed, language, and AI reply style
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
- ElevenLabs for text-to-speech
- Gemini TTS API as fallback speech provider
- Python 3 + `elevenlabs-python` SDK for ElevenLabs synthesis execution

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
VENICE_API_KEY=your_venice_api_key
VENICE_MODEL=venice-uncensored
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_API_KEY_FALLBACK=optional_backup_elevenlabs_key
ELEVENLABS_DEFAULT_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
ELEVENLABS_USE_PYTHON_SDK=true
PYTHON_EXECUTABLE=python
GEMINI_API_KEY=optional_google_gemini_api_key_for_tts_fallback
GEMINI_API_KEY_2=optional_second_google_gemini_api_key
GEMINI_API_KEY_3=optional_third_google_gemini_api_key
GEMINI_API_KEY_4=optional_fourth_google_gemini_api_key
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Kore
GOOGLE_API_KEY=optional_alias_for_gemini_api_key
GOOGLE_API_KEY_2=optional_alias_for_second_gemini_key
GOOGLE_API_KEY_3=optional_alias_for_third_gemini_key
GOOGLE_API_KEY_4=optional_alias_for_fourth_gemini_key
GOOGLE_TTS_MODEL=optional_alias_for_gemini_tts_model
GOOGLE_TTS_VOICE=optional_alias_for_gemini_tts_voice
PORT=8080
```

`GOOGLE_API_KEY`, `GOOGLE_TTS_MODEL`, and `GOOGLE_TTS_VOICE` are accepted as aliases for the Gemini settings.

For Gemini key failover, configure `GEMINI_API_KEY_2/3/4` (or `GOOGLE_API_KEY_2/3/4`). The bot tries keys in order and falls back to the next key when auth/quota/rate-limit errors occur.

`ELEVENLABS_USE_PYTHON_SDK=true` makes the bot execute ElevenLabs TTS through `tts.py` using the official Python SDK. If Python execution fails, the bot falls back to the REST path automatically.

`DISCORD_GUILD_ID` is optional but recommended while testing because guild commands register much faster than global commands.

## Install And Run

```bash
npm install
npm run build
npm start
```

Install Python dependency once:

```bash
python -m pip install -r requirements.txt
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
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_API_KEY_FALLBACK` (optional)
   - `ELEVENLABS_DEFAULT_VOICE_ID`
   - `ELEVENLABS_MODEL_ID`
   - `ELEVENLABS_USE_PYTHON_SDK=true`
   - `PYTHON_EXECUTABLE` (for example `python3`)
   - `GEMINI_API_KEY` (optional fallback)
   - `GEMINI_TTS_MODEL` (optional)
   - `GEMINI_TTS_VOICE` (optional)
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
- `/preferences voices`: List provider voices and Google/Gemini voices
- `/game guess-start|guess-pick|trivia|scramble|rps|coinflip`: Play text games
- `/voice join|leave|auto-read|autojoin|language`: Voice controls plus automatic VC speech options
- `/tts say|stop|voices`: Speak text with available TTS providers (ElevenLabs or Gemini fallback)
- `/admin feature|system-prompt|announce|clear-history|set-announcements|tts-language`: Server-level management

## Notes

- Nami stores server settings, user preferences, and short chat history in `data/storage.json`.
- Generated TTS files are created temporarily under `data/audio` and cleaned up after playback.
- `/tts voices` shows provider voice IDs and Google/Gemini voice names.
- Google/Gemini voice can be set via `/preferences voice google_voice:<name|auto>`. `auto` picks a default voice based on your preferred language.
- TTS speech language now defaults to server-level Hindi. Change it with `/voice language value:<language>` or `/admin tts-language value:<language>`.
- As of April 10, 2026, OpenRouter free models and ElevenLabs plans can still have provider-side rate, concurrency, or credit limits. "Free" does not mean unlimited.
- Render free instances use ephemeral local storage. If the service is rebuilt/restarted, `data/storage.json` may reset unless you attach persistent storage or external DB.
- Slash commands are registered automatically on startup.

## Pinger Site (Vercel)

This repo includes a lightweight website in `pinger-site` that can send GET requests to your Render URL at random intervals between 1 and 10 seconds.

Deploy only that folder to Vercel:

```bash
cd pinger-site
npx vercel --prod
```


