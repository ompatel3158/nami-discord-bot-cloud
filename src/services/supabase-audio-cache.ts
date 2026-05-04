import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";

export class SupabaseAudioCache {
  private readonly client: SupabaseClient;
  private readonly bucket: string;
  private readonly prefix: string;

  static isConfigured(config: AppConfig): boolean {
    return Boolean(
      config.supabaseUrl?.trim() &&
        config.supabaseServiceRoleKey?.trim() &&
        config.supabaseTtsBucket?.trim()
    );
  }

  constructor(config: AppConfig) {
    if (!SupabaseAudioCache.isConfigured(config)) {
      throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_TTS_BUCKET are required for SupabaseAudioCache.");
    }

    this.client = createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.bucket = config.supabaseTtsBucket!;
    this.prefix = (config.supabaseTtsBucketPrefix || "tts-cache").replace(/^\/+|\/+$/g, "");
  }

  async download(objectKey: string): Promise<Buffer | null> {
    const fullPath = this.path(objectKey);
    const { data, error } = await this.client.storage.from(this.bucket).download(fullPath);

    if (error) {
      if (this.isNotFound(error)) {
        return null;
      }

      throw new Error(`Failed to download Supabase audio cache object '${fullPath}': ${error.message}`);
    }

    const bytes = Buffer.from(await data.arrayBuffer());
    return bytes.length > 0 ? bytes : null;
  }

  async upload(objectKey: string, payload: Buffer, contentType = "audio/mpeg"): Promise<void> {
    const fullPath = this.path(objectKey);
    const { error } = await this.client.storage.from(this.bucket).upload(fullPath, payload, {
      upsert: true,
      contentType,
      cacheControl: "31536000"
    });

    if (error) {
      throw new Error(`Failed to upload Supabase audio cache object '${fullPath}': ${error.message}`);
    }
  }

  private path(objectKey: string): string {
    const cleanKey = objectKey.replace(/^\/+|\/+$/g, "");
    return this.prefix ? `${this.prefix}/${cleanKey}` : cleanKey;
  }

  private isNotFound(error: { statusCode?: string; message?: string }): boolean {
    return error.statusCode === "404" || /not found|does not exist|no such file/i.test(error.message ?? "");
  }
}
