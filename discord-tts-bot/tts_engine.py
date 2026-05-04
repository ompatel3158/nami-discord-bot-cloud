"""
tts_engine.py — Google Cloud TTS wrapper
Handles: dynamic voices, fallback chain, caching, language detection,
         text preprocessing, name-prefix audio, audio stitching
"""

import os
import re
import hashlib
import requests
from pathlib import Path
from pydub import AudioSegment

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
CACHE_DIR        = Path("audio_cache")          # individual message audio
PREFIX_CACHE_DIR = Path("audio_cache/prefixes") # "[name] said" audio (per user)
JOINED_CACHE_DIR = Path("audio_cache/joined")   # stitched prefix+message audio
CACHE_DIR.mkdir(exist_ok=True)
PREFIX_CACHE_DIR.mkdir(exist_ok=True)
JOINED_CACHE_DIR.mkdir(exist_ok=True)

MAX_CHARS = 250          # safe limit well under 5000-byte API limit
COOLDOWN_SECONDS = 2     # per-user cooldown (enforced in bot.py)

TTS_ENDPOINT   = "https://texttospeech.googleapis.com/v1/text:synthesize"
VOICE_ENDPOINT = "https://texttospeech.googleapis.com/v1/voices"

# Fallback priority per language
VOICE_PRIORITY = {
    "hi-IN": [
        {"name": "hi-IN-Neural2-A", "ssmlGender": "FEMALE"},   # best
        {"name": "hi-IN-Neural2-B", "ssmlGender": "MALE"},
        {"name": "hi-IN-Wavenet-A", "ssmlGender": "FEMALE"},
        {"name": "hi-IN-Standard-A","ssmlGender": "FEMALE"},
    ],
    "gu-IN": [
        {"name": "gu-IN-Wavenet-A", "ssmlGender": "FEMALE"},
        {"name": "gu-IN-Wavenet-B", "ssmlGender": "MALE"},
        {"name": "gu-IN-Standard-A","ssmlGender": "FEMALE"},
        {"name": "gu-IN-Standard-B","ssmlGender": "MALE"},
    ],
    "en-US": [
        {"name": "en-US-Neural2-C", "ssmlGender": "FEMALE"},
        {"name": "en-US-Wavenet-C", "ssmlGender": "FEMALE"},
        {"name": "en-US-Standard-C","ssmlGender": "FEMALE"},
    ],
}

# ──────────────────────────────────────────────
# Dynamic voice fetching
# ──────────────────────────────────────────────
_available_voices: dict[str, list] = {}

def fetch_available_voices(api_key: str) -> dict[str, list]:
    """
    Hits GET /v1/voices and returns a dict:
      { "hi-IN": [...voice objects...], "gu-IN": [...], ... }
    """
    global _available_voices
    try:
        resp = requests.get(VOICE_ENDPOINT, params={"key": api_key}, timeout=10)
        resp.raise_for_status()
        voices = resp.json().get("voices", [])

        buckets: dict[str, list] = {}
        for v in voices:
            for lang in v.get("languageCodes", []):
                buckets.setdefault(lang, []).append(v)

        _available_voices = buckets
        print(f"[TTS] Fetched {len(voices)} voices. Languages available: {list(buckets.keys())}")
    except Exception as e:
        print(f"[TTS] Could not fetch voice list: {e}. Using hardcoded fallbacks.")

    return _available_voices


def get_voices_for_lang(lang: str) -> list[str]:
    """Return list of available voice names for a language code."""
    if lang not in _available_voices:
        return []
    return [v["name"] for v in _available_voices[lang]]


# ──────────────────────────────────────────────
# Text preprocessing
# ──────────────────────────────────────────────
_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F9FF"
    "\U00002700-\U000027BF"
    "\U0001FA00-\U0001FA6F"
    "\U00002600-\U000026FF"
    "]+",
    flags=re.UNICODE,
)

def preprocess(text: str) -> str:
    """
    Clean text before sending to TTS:
      - Remove emojis
      - Collapse repeated characters (heyyyy → hey)
      - Strip Discord mentions/channels
      - Trim whitespace
      - Enforce MAX_CHARS limit
    """
    # Remove Discord mentions (@user, #channel, @role)
    text = re.sub(r"<@[!&]?\d+>|<#\d+>|<@&\d+>", "", text)
    # Remove emojis
    text = _EMOJI_RE.sub("", text)
    # Collapse 3+ repeated chars → 2  (heyyyy → heyy; still feels natural)
    text = re.sub(r"(.)\1{2,}", r"\1\1", text)
    # Collapse multiple spaces / newlines
    text = re.sub(r"\s+", " ", text).strip()
    # Hard cap
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + "…"
    return text


# ──────────────────────────────────────────────
# Language detection
# ──────────────────────────────────────────────
_GUJARATI_RE = re.compile(r"[\u0A80-\u0AFF]")
_HINDI_RE    = re.compile(r"[\u0900-\u097F]")

def detect_language(text: str) -> str:
    """
    Returns a BCP-47 language code based on Unicode script detection.
    Priority: Gujarati → Hindi → English (default)
    """
    if _GUJARATI_RE.search(text):
        return "gu-IN"
    if _HINDI_RE.search(text):
        return "hi-IN"
    return "hi-IN"   # default to Hindi even for Roman-script text


# ──────────────────────────────────────────────
# Cache helpers
# ──────────────────────────────────────────────
def _cache_key(text: str, lang: str) -> str:
    payload = f"{lang}:{text}"
    return hashlib.sha256(payload.encode()).hexdigest()

def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.mp3"

def get_cached(text: str, lang: str) -> Path | None:
    path = _cache_path(_cache_key(text, lang))
    return path if path.exists() else None

def save_cache(text: str, lang: str, audio_bytes: bytes) -> Path:
    path = _cache_path(_cache_key(text, lang))
    path.write_bytes(audio_bytes)
    return path


# ──────────────────────────────────────────────
# TTS synthesis with fallback chain
# ──────────────────────────────────────────────
def synthesize(text: str, api_key: str, lang: str | None = None) -> Path:
    """
    Full pipeline:
      1. Preprocess text
      2. Detect language (if not provided)
      3. Check cache → return if hit
      4. Try voices in priority order (Neural2 → WaveNet → Standard)
      5. Cache result and return path

    Returns path to MP3 file ready for Discord playback.
    Raises RuntimeError if all voices fail.
    """
    clean_text = preprocess(text)
    if not clean_text:
        raise ValueError("Text is empty after preprocessing.")

    if lang is None:
        lang = detect_language(clean_text)

    # Cache hit?
    cached = get_cached(clean_text, lang)
    if cached:
        print(f"[TTS] Cache hit for lang={lang}")
        return cached

    # Build candidate voice list: prioritize dynamically fetched, fall back to hardcoded
    dynamic_names = get_voices_for_lang(lang)
    priority_list = VOICE_PRIORITY.get(lang, VOICE_PRIORITY["hi-IN"])

    # Sort priority list: voices that exist in dynamic fetch go first
    candidates = sorted(
        priority_list,
        key=lambda v: (0 if v["name"] in dynamic_names else 1),
    )

    # If dynamic fetch found voices NOT in our hardcoded list, prepend Neural2 ones
    extra = [
        {"name": n, "ssmlGender": "FEMALE"}
        for n in dynamic_names
        if n not in [c["name"] for c in candidates] and "Neural2" in n
    ]
    candidates = extra + candidates

    last_error = None
    for voice in candidates:
        audio_bytes = _call_tts_api(clean_text, lang, voice, api_key)
        if audio_bytes:
            path = save_cache(clean_text, lang, audio_bytes)
            print(f"[TTS] Synthesized with {voice['name']} → {path}")
            return path
        print(f"[TTS] Voice {voice['name']} failed, trying next…")

    raise RuntimeError(f"All TTS voices failed for lang={lang}. Last error: {last_error}")


# ──────────────────────────────────────────────
# Name-prefix synthesis  ("Om said")
# ──────────────────────────────────────────────
def synthesize_prefix(display_name: str, api_key: str, lang: str | None = None) -> Path:
    """
    Synthesizes "[display_name] said" as a separate cached MP3.
    Stored in audio_cache/prefixes/ keyed by normalized prefix text.
    This is generated ONCE per unique name and reused forever, regardless
    of the message language that follows it.
    """
    _ = lang

    # Clean name — only keep letters/numbers, no emojis/symbols
    safe_name = re.sub(r"[^\w\s]", "", display_name).strip()
    safe_name = re.sub(r"\s+", " ", safe_name)
    if not safe_name:
        safe_name = "Someone"

    prefix_text = f"{safe_name} said"

    # Separate cache key so it never collides with message cache, and so a
    # single prefix is reused across all chat languages.
    key = hashlib.sha256(f"prefix:{prefix_text}".encode()).hexdigest()
    path = PREFIX_CACHE_DIR / f"{key}.mp3"

    if path.exists():
        print(f"[TTS] Prefix cache hit → '{prefix_text}'")
        return path

    # Synthesize — use English voice for names regardless of chat lang
    # (names are Roman script and sound better in en-US voice)
    name_lang = "en-US"
    name_voices = [
        {"name": "en-US-Neural2-C", "ssmlGender": "FEMALE"},
        {"name": "en-US-Wavenet-C", "ssmlGender": "FEMALE"},
        {"name": "en-US-Standard-C","ssmlGender": "FEMALE"},
    ]
    for voice in name_voices:
        audio_bytes = _call_tts_api(prefix_text, name_lang, voice, api_key)
        if audio_bytes:
            path.write_bytes(audio_bytes)
            print(f"[TTS] Prefix generated with {voice['name']} → '{prefix_text}'")
            return path

    raise RuntimeError(f"Could not synthesize prefix for '{display_name}'")


# ──────────────────────────────────────────────
# Audio stitching  (prefix MP3 + message MP3 → one file)
# ──────────────────────────────────────────────
def join_audio(prefix_path: Path, msg_path: Path) -> Path:
    """
    Joins two MP3 files into one using pydub.
    Output is cached by hashing both input paths — so the same
    (prefix + message) combination is never re-joined.

    Cache structure:  audio_cache/joined/<hash>.mp3
    """
    join_key = hashlib.sha256(
        f"{prefix_path.stem}:{msg_path.stem}".encode()
    ).hexdigest()
    out_path = JOINED_CACHE_DIR / f"{join_key}.mp3"

    if out_path.exists():
        print(f"[TTS] Joined-audio cache hit")
        return out_path

    seg_prefix = AudioSegment.from_mp3(prefix_path)
    seg_msg    = AudioSegment.from_mp3(msg_path)

    # 150ms natural pause between "[name] said" and the actual message
    silence    = AudioSegment.silent(duration=150)
    combined   = seg_prefix + silence + seg_msg

    combined.export(out_path, format="mp3", bitrate="128k")
    print(f"[TTS] Joined audio → {out_path}")
    return out_path


def _call_tts_api(text: str, lang: str, voice: dict, api_key: str) -> bytes | None:
    """
    Single TTS API call. Returns raw MP3 bytes on success, None on failure.
    """
    payload = {
        "input": {"text": text},
        "voice": {
            "languageCode": lang,
            "name": voice["name"],
            "ssmlGender": voice.get("ssmlGender", "FEMALE"),
        },
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": 1.0,
            "pitch": 0.0,
        },
    }
    try:
        resp = requests.post(
            TTS_ENDPOINT,
            params={"key": api_key},
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        import base64
        audio_b64 = resp.json().get("audioContent", "")
        return base64.b64decode(audio_b64) if audio_b64 else None
    except requests.HTTPError as e:
        print(f"[TTS] HTTP error for voice {voice['name']}: {e.response.status_code}")
        return None
    except Exception as e:
        print(f"[TTS] Unexpected error: {e}")
        return None
