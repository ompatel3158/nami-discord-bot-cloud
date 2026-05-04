import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FeatureFlag, GuildSettings, TtsVoice, UserPreferences } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");

const ALL_FEATURES: FeatureFlag[] = ["ai", "search", "games", "tts"];

export const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  features: ALL_FEATURES.reduce<Record<FeatureFlag, boolean>>((accumulator, feature) => {
    accumulator[feature] = true;
    return accumulator;
  }, {} as Record<FeatureFlag, boolean>),
  systemPrompt:
    "You are Nami, a friendly Discord bot. Be helpful, clear, and practical. Keep replies SHORT — 1-3 lines for most messages. Only write more when the question genuinely needs it.",
  ttsLanguage: "Hindi",
  announcementChannelId: undefined,
  autoVoiceReadEnabled: false,
  autoVoiceJoinEnabled: false,
  autoVoiceJoinIncludeChannelIds: [],
  autoVoiceJoinExcludeChannelIds: []
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  voice: "default",
  ttsInstructions: "Friendly, clear, and natural.",
  ttsSpeed: 1,
  aiStyle: "Friendly, practical, and easy to understand.",
  searchEnabledByDefault: false,
  language: "English",
  modelMode: "smart"
};

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaFallbackModels: string[];
  ollamaApiKey?: string;
  ollamaTimeoutMs: number;
  googleTtsApiKey?: string;
  googleTtsSpeakingRate: number;
  googleTtsPitch: number;
  ttsMaxChars: number;
  ttsCooldownSeconds: number;
  ttsDailyUserRequestLimit?: number;
  ttsDailyUserCharacterLimit?: number;
  ttsDailyGuildRequestLimit?: number;
  ttsDailyGuildCharacterLimit?: number;
  ttsDailyGlobalRequestLimit?: number;
  ttsDailyGlobalCharacterLimit?: number;
  cartesiaApiKey?: string;
  cartesiaVersion: string;
  cartesiaModel: string;
  cartesiaDefaultVoiceId: string;
  cartesiaMaxBufferDelayMs: number;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  useSupabaseStorage: boolean;
  supabaseTtsBucket?: string;
  supabaseTtsBucketPrefix: string;
  veniceApiKey?: string;
  veniceModel: string;
  huggingFaceApiKey?: string;
  huggingFaceModel: string;
  openRouterApiKey?: string;
  openRouterModel: string;
  elevenLabsApiKey?: string;
  elevenLabsApiKeyFallback?: string;
  elevenLabsDefaultVoiceId: TtsVoice;
  elevenLabsModelId: string;
  elevenLabsUsePythonSdk: boolean;
  pythonExecutable: string;
  geminiApiKey?: string;
  geminiApiKeys: string[];
  geminiTtsModel: string;
  geminiTtsVoice: string;
}

function collectUniqueNonEmpty(values: Array<string | undefined>): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return defaultValue;
  }

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return parsed;
}

function envFloat(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return parsed;
}

function envOptionalInt(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function envCsv(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return [];
  }

  return collectUniqueNonEmpty(raw.split(",").map((value) => value.trim()));
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig(): AppConfig {
  const geminiApiKeys = collectUniqueNonEmpty([
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GOOGLE_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GOOGLE_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GOOGLE_API_KEY_4
  ]);

  return {
    discordToken: requiredEnv("DISCORD_TOKEN"),
    discordClientId: requiredEnv("DISCORD_CLIENT_ID"),
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    ollamaBaseUrl:
      process.env.OLLAMA_BASE_URL?.trim() ||
      process.env.OLLAMA_URL?.trim() ||
      "https://ollama.com",
    ollamaModel: process.env.OLLAMA_MODEL?.trim() || "llama3.1:8b",
    ollamaFallbackModels: envCsv("OLLAMA_FALLBACK_MODELS"),
    ollamaApiKey: process.env.OLLAMA_API_KEY?.trim() || undefined,
    ollamaTimeoutMs: Math.max(5_000, Math.min(120_000, envInt("OLLAMA_TIMEOUT_MS", 30_000))),
    googleTtsApiKey:
      process.env.GOOGLE_TTS_KEY?.trim() ||
      process.env.GOOGLE_TTS_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      undefined,
    googleTtsSpeakingRate: Math.max(0.25, Math.min(4, envFloat("GOOGLE_TTS_SPEAKING_RATE", 1))),
    googleTtsPitch: Math.max(-20, Math.min(20, envFloat("GOOGLE_TTS_PITCH", 0))),
    ttsMaxChars: Math.max(50, Math.min(1000, envInt("TTS_MAX_CHARS", 250))),
    ttsCooldownSeconds: Math.max(0, Math.min(30, envInt("TTS_COOLDOWN_SECONDS", 2))),
    ttsDailyUserRequestLimit: envOptionalInt("TTS_DAILY_USER_REQUEST_LIMIT") ?? 300,
    ttsDailyUserCharacterLimit: envOptionalInt("TTS_DAILY_USER_CHARACTER_LIMIT") ?? 75_000,
    ttsDailyGuildRequestLimit: envOptionalInt("TTS_DAILY_GUILD_REQUEST_LIMIT") ?? 3_000,
    ttsDailyGuildCharacterLimit: envOptionalInt("TTS_DAILY_GUILD_CHARACTER_LIMIT") ?? 600_000,
    ttsDailyGlobalRequestLimit: envOptionalInt("TTS_DAILY_GLOBAL_REQUEST_LIMIT") ?? 12_000,
    ttsDailyGlobalCharacterLimit: envOptionalInt("TTS_DAILY_GLOBAL_CHARACTER_LIMIT") ?? 2_400_000,
    cartesiaApiKey: process.env.CARTESIA_API_KEY?.trim() || undefined,
    cartesiaVersion: process.env.CARTESIA_VERSION?.trim() || "2026-03-01",
    cartesiaModel: process.env.CARTESIA_MODEL?.trim() || "sonic-3",
    cartesiaDefaultVoiceId:
      process.env.CARTESIA_DEFAULT_VOICE_ID?.trim() || "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    cartesiaMaxBufferDelayMs: Math.max(0, Math.min(5000, envInt("CARTESIA_MAX_BUFFER_DELAY_MS", 3000))),
    supabaseUrl: process.env.SUPABASE_URL?.trim() || undefined,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    useSupabaseStorage: envFlag("USE_SUPABASE_STORAGE", false),
    supabaseTtsBucket: process.env.SUPABASE_TTS_BUCKET?.trim() || undefined,
    supabaseTtsBucketPrefix: process.env.SUPABASE_TTS_BUCKET_PREFIX?.trim() || "tts-cache",
    veniceApiKey:
      process.env.VENICE_API_KEY?.trim() || process.env.VENICE_INFERENCE_KEY?.trim() || undefined,
    veniceModel: process.env.VENICE_MODEL?.trim() || "venice-uncensored",
    huggingFaceApiKey:
      process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_API_KEY?.trim() || undefined,
    huggingFaceModel:
      process.env.HUGGINGFACE_MODEL?.trim() || "dphn/Dolphin-Mistral-24B-Venice-Edition",
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
    openRouterModel: process.env.OPENROUTER_MODEL?.trim() || "nvidia/nemotron-3-super-120b-a12b:free",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY?.trim() || undefined,
    elevenLabsApiKeyFallback: process.env.ELEVENLABS_API_KEY_FALLBACK?.trim() || undefined,
    elevenLabsDefaultVoiceId:
      (process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() as TtsVoice | undefined) ||
      "21m00Tcm4TlvDq8ikWAM",
    elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5",
    elevenLabsUsePythonSdk: envFlag("ELEVENLABS_USE_PYTHON_SDK", true),
    pythonExecutable:
      process.env.PYTHON_EXECUTABLE?.trim() || (process.platform === "win32" ? "python" : "python3"),
    geminiApiKey: geminiApiKeys[0],
    geminiApiKeys,
    geminiTtsModel:
      process.env.GEMINI_TTS_MODEL?.trim() || process.env.GOOGLE_TTS_MODEL?.trim() || "gemini-2.5-flash-preview-tts",
    geminiTtsVoice:
      process.env.GEMINI_TTS_VOICE?.trim() || process.env.GOOGLE_TTS_VOICE?.trim() || "Kore"
  };
}
