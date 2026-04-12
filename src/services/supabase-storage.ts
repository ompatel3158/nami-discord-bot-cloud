import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_GUILD_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  type AppConfig
} from "../config.js";
import type { StorageProvider } from "../storage.js";
import type {
  ConversationMessage,
  GuildSettings,
  UserPreferences
} from "../types.js";

interface GuildSettingsRow {
  guild_id: string;
  data: GuildSettings;
  updated_at?: string;
}

interface UserPreferencesRow {
  user_id: string;
  data: UserPreferences;
  updated_at?: string;
}

interface ConversationRow {
  id: number;
  guild_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SupabaseStorage implements StorageProvider {
  private readonly client: SupabaseClient;

  static isConfigured(config: AppConfig): boolean {
    return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
  }

  constructor(config: AppConfig) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to use SupabaseStorage.");
    }

    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  private normalizeGuildSettings(row: GuildSettingsRow | null): GuildSettings {
    const merged = {
      ...DEFAULT_GUILD_SETTINGS,
      ...(row?.data ?? {})
    } as GuildSettings;

    return deepClone(merged);
  }

  private normalizeUserPreferences(row: UserPreferencesRow | null): UserPreferences {
    const merged = {
      ...DEFAULT_USER_PREFERENCES,
      ...(row?.data ?? {})
    } as UserPreferences;

    return deepClone(merged);
  }

  async getGuildSettings(guildId: string): Promise<GuildSettings> {
    const { data, error } = await this.client
      .from("guild_settings")
      .select("guild_id,data,updated_at")
      .eq("guild_id", guildId)
      .maybeSingle<GuildSettingsRow>();

    if (error) {
      throw new Error(`Failed to read guild settings from Supabase: ${error.message}`);
    }

    return this.normalizeGuildSettings(data);
  }

  async saveGuildSettings(guildId: string, settings: GuildSettings): Promise<GuildSettings> {
    const payload: GuildSettingsRow = {
      guild_id: guildId,
      data: deepClone(settings)
    };

    const { error } = await this.client
      .from("guild_settings")
      .upsert(payload, { onConflict: "guild_id" });

    if (error) {
      throw new Error(`Failed to write guild settings to Supabase: ${error.message}`);
    }

    return deepClone(settings);
  }

  async updateGuildSettings(
    guildId: string,
    updater: (current: GuildSettings) => GuildSettings
  ): Promise<GuildSettings> {
    const current = await this.getGuildSettings(guildId);
    const next = updater(current);
    return this.saveGuildSettings(guildId, next);
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const { data, error } = await this.client
      .from("user_preferences")
      .select("user_id,data,updated_at")
      .eq("user_id", userId)
      .maybeSingle<UserPreferencesRow>();

    if (error) {
      throw new Error(`Failed to read user preferences from Supabase: ${error.message}`);
    }

    return this.normalizeUserPreferences(data);
  }

  async saveUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    const payload: UserPreferencesRow = {
      user_id: userId,
      data: deepClone(preferences)
    };

    const { error } = await this.client
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      throw new Error(`Failed to write user preferences to Supabase: ${error.message}`);
    }

    return deepClone(preferences);
  }

  async updateUserPreferences(
    userId: string,
    updater: (current: UserPreferences) => UserPreferences
  ): Promise<UserPreferences> {
    const current = await this.getUserPreferences(userId);
    const next = updater(current);
    return this.saveUserPreferences(userId, next);
  }

  async getConversation(guildId: string, userId: string): Promise<ConversationMessage[]> {
    const { data, error } = await this.client
      .from("conversations")
      .select("id,guild_id,user_id,role,content,created_at")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .returns<ConversationRow[]>();

    if (error) {
      throw new Error(`Failed to read conversation history from Supabase: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  async appendConversation(
    guildId: string,
    userId: string,
    message: ConversationMessage,
    limit = 40
  ): Promise<ConversationMessage[]> {
    const { error: insertError } = await this.client
      .from("conversations")
      .insert({
        guild_id: guildId,
        user_id: userId,
        role: message.role,
        content: message.content,
        created_at: message.createdAt
      });

    if (insertError) {
      throw new Error(`Failed to append conversation to Supabase: ${insertError.message}`);
    }

    const { data: rows, error: readError } = await this.client
      .from("conversations")
      .select("id,guild_id,user_id,role,content,created_at")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .returns<ConversationRow[]>();

    if (readError) {
      throw new Error(`Failed to read conversation history from Supabase: ${readError.message}`);
    }

    const history = rows ?? [];
    if (history.length > limit) {
      const staleIds = history.slice(limit).map((row) => row.id);
      if (staleIds.length > 0) {
        const { error: pruneError } = await this.client
          .from("conversations")
          .delete()
          .in("id", staleIds);

        if (pruneError) {
          throw new Error(`Failed to prune old conversation rows in Supabase: ${pruneError.message}`);
        }
      }
    }

    return history
      .slice(0, limit)
      .reverse()
      .map((row) => ({
        role: row.role,
        content: row.content,
        createdAt: row.created_at
      }));
  }

  async clearConversation(guildId: string, userId?: string): Promise<number> {
    let countQuery = this.client
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("guild_id", guildId);

    let deleteQuery = this.client
      .from("conversations")
      .delete()
      .eq("guild_id", guildId);

    if (userId) {
      countQuery = countQuery.eq("user_id", userId);
      deleteQuery = deleteQuery.eq("user_id", userId);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new Error(`Failed to count conversation rows for clear: ${countError.message}`);
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) {
      throw new Error(`Failed to clear conversation rows from Supabase: ${deleteError.message}`);
    }

    return count ?? 0;
  }
}
