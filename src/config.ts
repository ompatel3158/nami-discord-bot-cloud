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
    "You are Nami, a friendly Discord bot. Be chatty, helpful, clear, and practical. Keep replies readable inside Discord.",
  ttsLanguage: "Hindi",
  announcementChannelId: undefined,
  autoVoiceReadEnabled: false,
  autoVoiceJoinEnabled: false,
  autoVoiceJoinIncludeChannelIds: [],
  autoVoiceJoinExcludeChannelIds: []
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  voice: "default",
  geminiVoice: "auto",
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
    huggingFaceApiKey:
      process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_API_KEY?.trim() || undefined,
    huggingFaceModel:
      process.env.HUGGINGFACE_MODEL?.trim() || "dphn/Dolphin-Mistral-24B-Venice-Edition",
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
    openRouterModel: process.env.OPENROUTER_MODEL?.trim() || "google/gemma-3-27b-it:free",
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
