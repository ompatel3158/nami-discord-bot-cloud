export type FeatureFlag = "ai" | "search" | "games" | "tts";
export type AiModelMode = "smart" | "uncensored";

export type TtsVoice = string;

export interface GuildSettings {
  features: Record<FeatureFlag, boolean>;
  systemPrompt: string;
  announcementChannelId?: string;
  autoVoiceReadEnabled: boolean;
  autoVoiceJoinEnabled: boolean;
  autoVoiceJoinIncludeChannelIds: string[];
  autoVoiceJoinExcludeChannelIds: string[];
}

export interface UserPreferences {
  voice: TtsVoice;
  ttsInstructions: string;
  ttsSpeed: number;
  aiStyle: string;
  searchEnabledByDefault: boolean;
  language: string;
  modelMode: AiModelMode;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface GuessGameState {
  secret: number;
  max: number;
  attempts: number;
  startedAt: string;
}

export interface TriviaGameState {
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
  startedAt: string;
}

export interface ScrambleGameState {
  scrambled: string;
  answer: string;
  startedAt: string;
}

export interface Citation {
  title: string;
  url: string;
}

export interface SearchResult {
  text: string;
  citations: Citation[];
}
