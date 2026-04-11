import fs from "node:fs";
import path from "node:path";
import {
  AUDIO_DIR,
  DATA_DIR,
  DEFAULT_GUILD_SETTINGS,
  DEFAULT_USER_PREFERENCES
} from "./config.js";
import type { ConversationMessage, GuildSettings, UserPreferences } from "./types.js";

interface StorageShape {
  guilds: Record<string, GuildSettings>;
  users: Record<string, UserPreferences>;
  conversations: Record<string, ConversationMessage[]>;
}

const STORAGE_FILE = path.join(DATA_DIR, "storage.json");
const EMPTY_STORAGE: StorageShape = {
  guilds: {},
  users: {},
  conversations: {}
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class AppStorage {
  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(AUDIO_DIR, { recursive: true });

    if (!fs.existsSync(STORAGE_FILE)) {
      this.write(EMPTY_STORAGE);
    }
  }

  private read(): StorageShape {
    try {
      const raw = fs.readFileSync(STORAGE_FILE, "utf8");
      return JSON.parse(raw) as StorageShape;
    } catch (error) {
      console.error("Storage file was unreadable; resetting to a clean store.", error);

      try {
        if (fs.existsSync(STORAGE_FILE)) {
          fs.copyFileSync(STORAGE_FILE, `${STORAGE_FILE}.corrupt-${Date.now()}`);
        }
      } catch {
        // Best-effort backup only.
      }

      this.write(EMPTY_STORAGE);
      return { ...EMPTY_STORAGE };
    }
  }

  private write(data: StorageShape): void {
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
}
