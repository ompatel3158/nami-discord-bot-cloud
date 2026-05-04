import fs from "node:fs";
import path from "node:path";
import {
  AUDIO_DIR,
  DATA_DIR,
  DEFAULT_GUILD_SETTINGS,
  DEFAULT_USER_PREFERENCES
} from "./config.js";
import type { ConversationMessage, GuildSettings, UserPreferences } from "./types.js";

export interface TtsLimitCheckInput {
  guildId: string;
  userId: string;
  characters: number;
  userRequestLimit?: number;
  userCharacterLimit?: number;
  guildRequestLimit?: number;
  guildCharacterLimit?: number;
  globalRequestLimit?: number;
  globalCharacterLimit?: number;
}

export interface TtsLimitUsageSnapshot {
  requestCount: number;
  characterCount: number;
  requestLimit?: number;
  characterLimit?: number;
}

export interface TtsLimitCheckResult {
  allowed: boolean;
  reason?: string;
  usageDate: string;
  user: TtsLimitUsageSnapshot;
  guild: TtsLimitUsageSnapshot;
  global: TtsLimitUsageSnapshot;
}

export interface StorageProvider {
  getGuildSettings(guildId: string): GuildSettings | Promise<GuildSettings>;
  saveGuildSettings(guildId: string, settings: GuildSettings): GuildSettings | Promise<GuildSettings>;
  updateGuildSettings(
    guildId: string,
    updater: (current: GuildSettings) => GuildSettings
  ): GuildSettings | Promise<GuildSettings>;

  getUserPreferences(userId: string): UserPreferences | Promise<UserPreferences>;
  saveUserPreferences(userId: string, preferences: UserPreferences): UserPreferences | Promise<UserPreferences>;
  updateUserPreferences(
    userId: string,
    updater: (current: UserPreferences) => UserPreferences
  ): UserPreferences | Promise<UserPreferences>;

  getConversation(guildId: string, userId: string): ConversationMessage[] | Promise<ConversationMessage[]>;
  appendConversation(
    guildId: string,
    userId: string,
    message: ConversationMessage,
    limit?: number
  ): ConversationMessage[] | Promise<ConversationMessage[]>;
  clearConversation(guildId: string, userId?: string): number | Promise<number>;
  trackTtsUsageAndCheckLimit(input: TtsLimitCheckInput): TtsLimitCheckResult | Promise<TtsLimitCheckResult>;
}

interface TtsUsageCounter {
  requestCount: number;
  characterCount: number;
  updatedAt: string;
}

interface StorageShape {
  guilds: Record<string, GuildSettings>;
  users: Record<string, UserPreferences>;
  conversations: Record<string, ConversationMessage[]>;
  ttsUsageDaily: Record<string, TtsUsageCounter>;
}

const STORAGE_FILE = path.join(DATA_DIR, "storage.json");
const EMPTY_STORAGE: StorageShape = {
  guilds: {},
  users: {},
  conversations: {},
  ttsUsageDaily: {}
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class AppStorage {
  /** In-memory cache — eliminates repeated full-file reads on every operation. */
  private cache: StorageShape | null = null;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(AUDIO_DIR, { recursive: true });

    if (!fs.existsSync(STORAGE_FILE)) {
      this.write(EMPTY_STORAGE);
    }
  }

  private read(): StorageShape {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = fs.readFileSync(STORAGE_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<StorageShape>;
      this.cache = {
        guilds: parsed.guilds ?? {},
        users: parsed.users ?? {},
        conversations: parsed.conversations ?? {},
        ttsUsageDaily: parsed.ttsUsageDaily ?? {}
      };
      return this.cache;
    } catch (error) {
      console.error("Storage file was unreadable; resetting to a clean store.", error);

      try {
        if (fs.existsSync(STORAGE_FILE)) {
          fs.copyFileSync(STORAGE_FILE, `${STORAGE_FILE}.corrupt-${Date.now()}`);
        }
      } catch {
        // Best-effort backup only.
      }

      this.cache = deepClone(EMPTY_STORAGE);
      this.write(EMPTY_STORAGE);
      return this.cache;
    }
  }

  private write(data: StorageShape): void {
    // Update the in-memory cache immediately so subsequent reads don't re-parse.
    this.cache = data;
    const tempFile = `${STORAGE_FILE}.tmp`;
    fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    fs.renameSync(tempFile, STORAGE_FILE);
  }

  getGuildSettings(guildId: string): GuildSettings {
    const store = this.read();
    const value = {
      ...DEFAULT_GUILD_SETTINGS,
      ...(store.guilds[guildId] ?? {})
    } as GuildSettings;
    return deepClone(value);
  }

  saveGuildSettings(guildId: string, settings: GuildSettings): GuildSettings {
    const store = this.read();
    store.guilds[guildId] = deepClone(settings);
    this.write(store);
    return deepClone(settings);
  }

  updateGuildSettings(guildId: string, updater: (current: GuildSettings) => GuildSettings): GuildSettings {
    const next = updater(this.getGuildSettings(guildId));
    return this.saveGuildSettings(guildId, next);
  }

  getUserPreferences(userId: string): UserPreferences {
    const store = this.read();
    const value = {
      ...DEFAULT_USER_PREFERENCES,
      ...(store.users[userId] ?? {})
    } as UserPreferences;
    return deepClone(value);
  }

  saveUserPreferences(userId: string, preferences: UserPreferences): UserPreferences {
    const store = this.read();
    store.users[userId] = deepClone(preferences);
    this.write(store);
    return deepClone(preferences);
  }

  updateUserPreferences(
    userId: string,
    updater: (current: UserPreferences) => UserPreferences
  ): UserPreferences {
    const next = updater(this.getUserPreferences(userId));
    return this.saveUserPreferences(userId, next);
  }

  getConversationKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  getConversation(guildId: string, userId: string): ConversationMessage[] {
    const store = this.read();
    return deepClone(store.conversations[this.getConversationKey(guildId, userId)] ?? []);
  }

  appendConversation(
    guildId: string,
    userId: string,
    message: ConversationMessage,
    limit = 40
  ): ConversationMessage[] {
    const store = this.read();
    const key = this.getConversationKey(guildId, userId);
    const current = store.conversations[key] ?? [];
    const next = [...current, deepClone(message)].slice(-limit);
    store.conversations[key] = next;
    this.write(store);
    return deepClone(next);
  }

  clearConversation(guildId: string, userId?: string): number {
    const store = this.read();
    let cleared = 0;

    if (userId) {
      const key = this.getConversationKey(guildId, userId);
      if (store.conversations[key]) {
        delete store.conversations[key];
        cleared = 1;
      }
    } else {
      for (const key of Object.keys(store.conversations)) {
        if (key.startsWith(`${guildId}:`)) {
          delete store.conversations[key];
          cleared += 1;
        }
      }
    }

    this.write(store);
    return cleared;
  }

  trackTtsUsageAndCheckLimit(input: TtsLimitCheckInput): TtsLimitCheckResult {
    const store = this.read();
    const usageDate = new Date().toISOString().slice(0, 10);
    const billableCharacters = Math.max(0, Math.floor(input.characters));

    const userKey = this.usageCounterKey(usageDate, "user", input.userId);
    const guildKey = this.usageCounterKey(usageDate, "guild", input.guildId);
    const globalKey = this.usageCounterKey(usageDate, "global", "global");

    const userCurrent = this.readUsageCounter(store, userKey);
    const guildCurrent = this.readUsageCounter(store, guildKey);
    const globalCurrent = this.readUsageCounter(store, globalKey);

    const userNextRequests = userCurrent.requestCount + 1;
    const userNextCharacters = userCurrent.characterCount + billableCharacters;
    const guildNextRequests = guildCurrent.requestCount + 1;
    const guildNextCharacters = guildCurrent.characterCount + billableCharacters;
    const globalNextRequests = globalCurrent.requestCount + 1;
    const globalNextCharacters = globalCurrent.characterCount + billableCharacters;

    const reason =
      this.resolveExceededReason(userNextRequests, input.userRequestLimit, "Daily user request") ||
      this.resolveExceededReason(userNextCharacters, input.userCharacterLimit, "Daily user character") ||
      this.resolveExceededReason(guildNextRequests, input.guildRequestLimit, "Daily guild request") ||
      this.resolveExceededReason(guildNextCharacters, input.guildCharacterLimit, "Daily guild character") ||
      this.resolveExceededReason(globalNextRequests, input.globalRequestLimit, "Daily global request") ||
      this.resolveExceededReason(globalNextCharacters, input.globalCharacterLimit, "Daily global character");

    if (reason) {
      return {
        allowed: false,
        reason,
        usageDate,
        user: {
          requestCount: userCurrent.requestCount,
          characterCount: userCurrent.characterCount,
          requestLimit: input.userRequestLimit,
          characterLimit: input.userCharacterLimit
        },
        guild: {
          requestCount: guildCurrent.requestCount,
          characterCount: guildCurrent.characterCount,
          requestLimit: input.guildRequestLimit,
          characterLimit: input.guildCharacterLimit
        },
        global: {
          requestCount: globalCurrent.requestCount,
          characterCount: globalCurrent.characterCount,
          requestLimit: input.globalRequestLimit,
          characterLimit: input.globalCharacterLimit
        }
      };
    }

    const updatedAt = new Date().toISOString();
    store.ttsUsageDaily[userKey] = {
      requestCount: userNextRequests,
      characterCount: userNextCharacters,
      updatedAt
    };
    store.ttsUsageDaily[guildKey] = {
      requestCount: guildNextRequests,
      characterCount: guildNextCharacters,
      updatedAt
    };
    store.ttsUsageDaily[globalKey] = {
      requestCount: globalNextRequests,
      characterCount: globalNextCharacters,
      updatedAt
    };

    // Prune stale daily-usage keys so storage.json doesn't grow unboundedly (#5).
    for (const key of Object.keys(store.ttsUsageDaily)) {
      const keyDate = key.split(":")[0];
      if (keyDate && keyDate < usageDate) {
        delete store.ttsUsageDaily[key];
      }
    }

    this.write(store);

    return {
      allowed: true,
      usageDate,
      user: {
        requestCount: userNextRequests,
        characterCount: userNextCharacters,
        requestLimit: input.userRequestLimit,
        characterLimit: input.userCharacterLimit
      },
      guild: {
        requestCount: guildNextRequests,
        characterCount: guildNextCharacters,
        requestLimit: input.guildRequestLimit,
        characterLimit: input.guildCharacterLimit
      },
      global: {
        requestCount: globalNextRequests,
        characterCount: globalNextCharacters,
        requestLimit: input.globalRequestLimit,
        characterLimit: input.globalCharacterLimit
      }
    };
  }

  private usageCounterKey(usageDate: string, scope: "user" | "guild" | "global", scopeId: string): string {
    return `${usageDate}:${scope}:${scopeId}`;
  }

  private readUsageCounter(store: StorageShape, key: string): TtsUsageCounter {
    const existing = store.ttsUsageDaily[key];
    if (existing) {
      return existing;
    }

    return {
      requestCount: 0,
      characterCount: 0,
      updatedAt: new Date(0).toISOString()
    };
  }

  private resolveExceededReason(value: number, limit: number | undefined, label: string): string | undefined {
    if (!limit) {
      return undefined;
    }

    if (value <= limit) {
      return undefined;
    }

    return `${label} limit reached (${limit}).`;
  }
}
