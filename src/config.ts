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
  openRouterApiKey?: string;
  openRouterModel: string;
  elevenLabsApiKey?: string;
  elevenLabsApiKeyFallback?: string;
  elevenLabsDefaultVoiceId: TtsVoice;
  elevenLabsModelId: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig(): AppConfig {
  return {
    discordToken: requiredEnv("DISCORD_TOKEN"),
    discordClientId: requiredEnv("DISCORD_CLIENT_ID"),
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
    openRouterModel: process.env.OPENROUTER_MODEL?.trim() || "google/gemma-3-27b-it:free",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY?.trim() || undefined,
    elevenLabsApiKeyFallback: process.env.ELEVENLABS_API_KEY_FALLBACK?.trim() || undefined,
    elevenLabsDefaultVoiceId:
      (process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() as TtsVoice | undefined) ||
      "21m00Tcm4TlvDq8ikWAM",
    elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5"
  };
}
