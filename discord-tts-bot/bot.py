"""
bot.py — Discord TTS Bot
Features: queue system, per-user cooldown, slash + prefix commands,
          voice channel management, dynamic voice listing
"""

import os
import time
import asyncio
import discord
from discord.ext import commands
from discord import app_commands
from collections import deque
from dotenv import load_dotenv

import tts_engine

# ──────────────────────────────────────────────
# Load environment
# ──────────────────────────────────────────────
load_dotenv()
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GOOGLE_TTS_KEY = os.getenv("GOOGLE_TTS_KEY")
COMMAND_PREFIX = os.getenv("COMMAND_PREFIX", "!")

if not DISCORD_TOKEN or not GOOGLE_TTS_KEY:
    raise EnvironmentError("Missing DISCORD_TOKEN or GOOGLE_TTS_KEY in .env")

# ──────────────────────────────────────────────
# Bot setup
# ──────────────────────────────────────────────
intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix=COMMAND_PREFIX, intents=intents)

# ──────────────────────────────────────────────
# State
# ──────────────────────────────────────────────
# guild_id → deque of (text, lang_override, user_id, display_name, needs_prefix) tuples
audio_queues: dict[int, deque] = {}

# user_id → last request timestamp (for cooldown)
cooldowns: dict[int, float] = {}
COOLDOWN_SECS = tts_engine.COOLDOWN_SECONDS

# guild_id → voice client
voice_clients: dict[int, discord.VoiceClient] = {}

# guild_id → user_id of whoever spoke LAST (for name-prefix logic)
last_speaker: dict[int, int] = {}

# guild_ids currently being drained by play_queue()
draining_guilds: set[int] = set()


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def is_on_cooldown(user_id: int) -> float:
    """Returns remaining cooldown seconds, or 0 if ready."""
    last = cooldowns.get(user_id, 0)
    remaining = COOLDOWN_SECS - (time.time() - last)
    return max(0.0, remaining)

def set_cooldown(user_id: int):
    cooldowns[user_id] = time.time()


def clear_guild_queue(guild_id: int):
    """
    Clear the live deque in-place so an active play_queue() loop sees the
    emptied queue immediately, then reset speaker tracking for the guild.
    """
    queue = audio_queues.get(guild_id)
    if queue is not None:
        queue.clear()
    audio_queues.pop(guild_id, None)
    last_speaker.pop(guild_id, None)


async def join_voice(interaction_or_ctx) -> discord.VoiceClient | None:
    """Join the user's voice channel. Returns VoiceClient or None."""
    if isinstance(interaction_or_ctx, discord.Interaction):
        user = interaction_or_ctx.user
        guild = interaction_or_ctx.guild
        send = interaction_or_ctx.followup.send
    else:
        user = interaction_or_ctx.author
        guild = interaction_or_ctx.guild
        send = interaction_or_ctx.send

    if not guild:
        await send("❌ This command only works in a server.")
        return None

    if not user.voice or not user.voice.channel:
        await send("❌ Join a voice channel first!")
        return None

    channel = user.voice.channel
    vc = voice_clients.get(guild.id)

    if vc and vc.is_connected():
        if vc.channel != channel:
            await vc.move_to(channel)
    else:
        vc = await channel.connect()
        voice_clients[guild.id] = vc

    return vc


async def play_queue(guild_id: int):
    """
    Drain the audio queue for this guild, one item at a time.

    Queue item: (text, lang, user_id, display_name, needs_prefix)
      - needs_prefix=True  → join "[name] said" + message audio
      - needs_prefix=False → play message audio directly (same speaker, consecutive)
    """
    try:
        while True:
            vc = voice_clients.get(guild_id)
            if not vc or not vc.is_connected():
                return

            queue = audio_queues.get(guild_id)
            if not queue:
                audio_queues.pop(guild_id, None)
                return

            text, lang, user_id, display_name, needs_prefix = queue.popleft()

            try:
                # Synthesize message audio (always cached after first time)
                msg_path = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda t=text, l=lang: tts_engine.synthesize(t, GOOGLE_TTS_KEY, l)
                )

                if needs_prefix:
                    # Synthesize "[name] said" prefix (cached per unique name)
                    prefix_path = await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda n=display_name, l=lang: tts_engine.synthesize_prefix(
                            n, GOOGLE_TTS_KEY, l
                        )
                    )
                    # Stitch them together (cached by pair hash)
                    audio_path = await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda p=prefix_path, m=msg_path: tts_engine.join_audio(p, m)
                    )
                else:
                    # Same speaker spoke again — skip the name, just the message
                    audio_path = msg_path

            except Exception as e:
                print(f"[BOT] Audio build error: {e}")
                continue

            # Play and wait
            done_event = asyncio.Event()

            def after_play(error):
                if error:
                    print(f"[BOT] Playback error: {error}")
                done_event.set()

            source = discord.FFmpegPCMAudio(str(audio_path))
            vc.play(source, after=after_play)
            await done_event.wait()
            await asyncio.sleep(0.3)
    finally:
        draining_guilds.discard(guild_id)

        queue = audio_queues.get(guild_id)
        vc = voice_clients.get(guild_id)
        if queue and vc and vc.is_connected() and guild_id not in draining_guilds:
            draining_guilds.add(guild_id)
            asyncio.create_task(play_queue(guild_id))


async def enqueue(guild_id: int, text: str, lang: str | None,
                  vc: discord.VoiceClient, user_id: int, display_name: str):
    """
    Add a TTS item to the queue with smart name-prefix logic:
      - New speaker (or first message ever)  → "[name] said" + message
      - Same speaker back-to-back             → message only (no repeated name)
      - Someone else speaks in between        → name announced again next time
    """
    queue = audio_queues.setdefault(guild_id, deque())

    # Announce name only if speaker changed
    needs_prefix = (last_speaker.get(guild_id) != user_id)
    last_speaker[guild_id] = user_id

    voice_clients[guild_id] = vc
    queue.append((text, lang, user_id, display_name, needs_prefix))

    if guild_id not in draining_guilds:
        draining_guilds.add(guild_id)
        asyncio.create_task(play_queue(guild_id))


# ──────────────────────────────────────────────
# Events
# ──────────────────────────────────────────────
@bot.event
async def on_ready():
    print(f"[BOT] Logged in as {bot.user} ({bot.user.id})")
    # Fetch voice list on startup (non-blocking)
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, tts_engine.fetch_available_voices, GOOGLE_TTS_KEY)
    # Sync slash commands
    try:
        synced = await bot.tree.sync()
        print(f"[BOT] Synced {len(synced)} slash commands.")
    except Exception as e:
        print(f"[BOT] Slash sync error: {e}")


@bot.event
async def on_voice_state_update(member, before, after):
    """Auto-disconnect when bot is alone in a channel."""
    for guild_id, vc in list(voice_clients.items()):
        if vc.is_connected() and len(vc.channel.members) == 1:
            if vc.is_playing():
                vc.stop()
            await vc.disconnect()
            voice_clients.pop(guild_id, None)
            clear_guild_queue(guild_id)
            print(f"[BOT] Auto-disconnected from guild {guild_id} (empty channel).")


# ──────────────────────────────────────────────
# Slash Commands
# ──────────────────────────────────────────────
@bot.tree.command(name="speak", description="Convert text to speech in your voice channel")
@app_commands.describe(
    text="What should I say? (max 250 chars)",
    language="Override language: hi (Hindi) | gu (Gujarati) | en (English)"
)
async def speak_slash(interaction: discord.Interaction, text: str, language: str = "auto"):
    await interaction.response.defer(ephemeral=False)

    # Cooldown check
    remaining = is_on_cooldown(interaction.user.id)
    if remaining > 0:
        await interaction.followup.send(f"⏳ Cooldown! Wait **{remaining:.1f}s** before speaking again.")
        return

    lang_map = {"hi": "hi-IN", "gu": "gu-IN", "en": "en-US"}
    lang = lang_map.get(language.lower()) if language != "auto" else None

    vc = await join_voice(interaction)
    if not vc:
        return

    set_cooldown(interaction.user.id)
    queued = len(audio_queues.get(interaction.guild.id, []))
    status = f"🔊 Speaking now..." if queued == 0 else f"📋 Added to queue (position {queued + 1})"
    await interaction.followup.send(status)

    display_name = interaction.user.display_name  # uses server nickname if set
    await enqueue(interaction.guild.id, text, lang, vc,
                  interaction.user.id, display_name)


@bot.tree.command(name="skip", description="Skip the current TTS audio")
async def skip_slash(interaction: discord.Interaction):
    vc = voice_clients.get(interaction.guild_id)
    if vc and vc.is_playing():
        vc.stop()
        await interaction.response.send_message("⏭ Skipped!")
    else:
        await interaction.response.send_message("Nothing is playing.", ephemeral=True)


@bot.tree.command(name="clearqueue", description="Clear all pending TTS messages")
async def clearqueue_slash(interaction: discord.Interaction):
    clear_guild_queue(interaction.guild_id)
    vc = voice_clients.get(interaction.guild_id)
    if vc and vc.is_playing():
        vc.stop()
    await interaction.response.send_message("🗑 Queue cleared!")


@bot.tree.command(name="leave", description="Disconnect bot from voice channel")
async def leave_slash(interaction: discord.Interaction):
    vc = voice_clients.get(interaction.guild_id)
    if vc and vc.is_connected():
        clear_guild_queue(interaction.guild_id)
        if vc.is_playing():
            vc.stop()
        await vc.disconnect()
        voice_clients.pop(interaction.guild_id, None)
        await interaction.response.send_message("👋 Disconnected.")
    else:
        await interaction.response.send_message("I'm not in a voice channel.", ephemeral=True)


@bot.tree.command(name="voices", description="List available TTS voices for a language")
@app_commands.describe(language="hi (Hindi) | gu (Gujarati) | en (English)")
async def voices_slash(interaction: discord.Interaction, language: str = "hi"):
    lang_map = {"hi": "hi-IN", "gu": "gu-IN", "en": "en-US"}
    lang = lang_map.get(language.lower(), "hi-IN")

    available = tts_engine.get_voices_for_lang(lang)
    if not available:
        await interaction.response.send_message(
            f"⚠ No cached voice list. Fetching now…", ephemeral=True
        )
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, tts_engine.fetch_available_voices, GOOGLE_TTS_KEY)
        available = tts_engine.get_voices_for_lang(lang)

    if available:
        voice_list = "\n".join(f"• `{v}`" for v in available[:15])
        embed = discord.Embed(
            title=f"🎤 Voices for `{lang}`",
            description=voice_list,
            color=0x5865F2
        )
        await interaction.response.send_message(embed=embed)
    else:
        await interaction.response.send_message(f"No voices found for `{lang}`.", ephemeral=True)


@bot.tree.command(name="ttsinfo", description="Show bot status, cache size, and queue info")
async def ttsinfo_slash(interaction: discord.Interaction):
    from pathlib import Path
    cache_files = list(Path("audio_cache").rglob("*.mp3"))
    cache_size_mb = sum(f.stat().st_size for f in cache_files) / (1024 * 1024)
    queue_len = len(audio_queues.get(interaction.guild_id, []))
    vc = voice_clients.get(interaction.guild_id)

    embed = discord.Embed(title="📊 TTS Bot Status", color=0x57F287)
    embed.add_field(name="🗂 Cache Files", value=str(len(cache_files)), inline=True)
    embed.add_field(name="💾 Cache Size", value=f"{cache_size_mb:.2f} MB", inline=True)
    embed.add_field(name="📋 Queue Length", value=str(queue_len), inline=True)
    embed.add_field(name="🔊 In VC", value="Yes" if vc and vc.is_connected() else "No", inline=True)
    embed.add_field(name="⚡ Char Limit", value=f"{tts_engine.MAX_CHARS}", inline=True)
    embed.add_field(name="⏱ Cooldown", value=f"{COOLDOWN_SECS}s", inline=True)
    await interaction.response.send_message(embed=embed)


# ──────────────────────────────────────────────
# Prefix Commands (fallback for !speak style usage)
# ──────────────────────────────────────────────
@bot.command(name="speak", aliases=["s", "tts"])
async def speak_prefix(ctx: commands.Context, *, text: str = ""):
    if not text:
        await ctx.send("Usage: `!speak <text>`")
        return

    remaining = is_on_cooldown(ctx.author.id)
    if remaining > 0:
        await ctx.send(f"⏳ Cooldown! Wait **{remaining:.1f}s**.")
        return

    vc = await join_voice(ctx)
    if not vc:
        return

    set_cooldown(ctx.author.id)
    await enqueue(ctx.guild.id, text, None, vc,
                  ctx.author.id, ctx.author.display_name)
    await ctx.message.add_reaction("🔊")


@bot.command(name="skip")
async def skip_prefix(ctx: commands.Context):
    vc = voice_clients.get(ctx.guild.id)
    if vc and vc.is_playing():
        vc.stop()
        await ctx.send("⏭ Skipped!")


@bot.command(name="leave", aliases=["stop", "dc"])
async def leave_prefix(ctx: commands.Context):
    vc = voice_clients.get(ctx.guild.id)
    if vc:
        clear_guild_queue(ctx.guild.id)
        if vc.is_playing():
            vc.stop()
        await vc.disconnect()
        voice_clients.pop(ctx.guild.id, None)
        await ctx.send("👋 Left voice channel.")


# ──────────────────────────────────────────────
# Run
# ──────────────────────────────────────────────
bot.run(DISCORD_TOKEN)
