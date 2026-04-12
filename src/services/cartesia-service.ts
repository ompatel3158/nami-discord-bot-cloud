import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { AppConfig } from "../config.js";

export interface CartesiaVoice {
  id: string;
  name: string;
  description?: string;
  language?: string;
  is_owner?: boolean;
  is_public?: boolean;
}

export interface CartesiaListVoicesOptions {
  limit?: number;
  startingAfter?: string;
  language?: string;
  query?: string;
}

export interface CartesiaSynthesisOptions {
  transcript: string;
  voiceId?: string;
  contextId?: string;
  continue?: boolean;
  flush?: boolean;
  maxBufferDelayMs?: number;
}

export interface CartesiaSynthesisResult {
  audioBuffer: Buffer;
  contextId: string;
}

interface CartesiaWsError {
  type?: string;
  done?: boolean;
  status_code?: number;
  error_code?: string | null;
  title?: string;
  message?: string;
  request_id?: string;
  doc_url?: string;
  context_id?: string;
}

export class CartesiaService {
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return Boolean(this.config.cartesiaApiKey?.trim());
  }

  async listVoices(options: CartesiaListVoicesOptions = {}): Promise<CartesiaVoice[]> {
    if (!this.config.cartesiaApiKey) {
      throw new Error("CARTESIA_API_KEY is missing.");
    }

    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.startingAfter) params.set("starting_after", options.startingAfter);
    if (options.language) params.set("language", options.language);
    if (options.query) params.set("q", options.query);

    const endpoint = `https://api.cartesia.ai/voices${params.size ? `?${params.toString()}` : ""}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.cartesiaApiKey}`,
        "Cartesia-Version": this.config.cartesiaVersion
      }
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Cartesia voices lookup failed (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as { data?: CartesiaVoice[] };
    return payload.data ?? [];
  }

  async synthesizeOnce(options: CartesiaSynthesisOptions): Promise<CartesiaSynthesisResult> {
    if (!this.config.cartesiaApiKey) {
      throw new Error("CARTESIA_API_KEY is missing.");
    }

    const contextId = options.contextId ?? randomUUID();
    const requestPayload = {
      model_id: this.config.cartesiaModel,
      transcript: options.transcript,
      voice: {
        mode: "id",
        id: options.voiceId || this.config.cartesiaDefaultVoiceId
      },
      context_id: contextId,
      continue: options.continue ?? false,
      flush: options.flush ?? false,
      max_buffer_delay_ms: options.maxBufferDelayMs ?? this.config.cartesiaMaxBufferDelayMs
    };

    const wsUrl = this.buildWebSocketUrl();
    const ws = new WebSocket(wsUrl);

    const chunks: Buffer[] = [];

    return new Promise<CartesiaSynthesisResult>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        reject(new Error("Cartesia websocket synthesis timed out."));
      }, 45_000);

      const finish = (handler: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        handler();
      };

      ws.on("open", () => {
        ws.send(JSON.stringify(requestPayload));
      });

      ws.on("message", (raw) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        if ((payload.type as string | undefined) === "error") {
          const parsed = payload as CartesiaWsError;
          finish(() => {
            ws.close();
            reject(
              new Error(
                `Cartesia websocket error (${parsed.status_code ?? "unknown"}${parsed.error_code ? `/${parsed.error_code}` : ""}): ${parsed.message ?? parsed.title ?? "Unknown error"}`
              )
            );
          });
          return;
        }

        const base64Chunk =
          (payload.data as string | undefined) ||
          (payload.audio as string | undefined) ||
          (payload.audio_chunk as string | undefined) ||
          (payload.chunk as string | undefined);

        if (typeof base64Chunk === "string" && base64Chunk.length > 0) {
          chunks.push(Buffer.from(base64Chunk, "base64"));
        }

        if (payload.done === true) {
          finish(() => {
            ws.close();
            resolve({
              audioBuffer: Buffer.concat(chunks),
              contextId
            });
          });
        }
      });

      ws.on("error", (error) => {
        finish(() => reject(new Error(`Cartesia websocket connection failed: ${error.message}`)));
      });

      ws.on("close", () => {
        if (!settled) {
          finish(() => {
            if (chunks.length > 0) {
              resolve({
                audioBuffer: Buffer.concat(chunks),
                contextId
              });
              return;
            }
            reject(new Error("Cartesia websocket closed before returning audio."));
          });
        }
      });
    });
  }

  private buildWebSocketUrl(): string {
    const params = new URLSearchParams({
      api_key: this.config.cartesiaApiKey ?? "",
      cartesia_version: this.config.cartesiaVersion
    });

    return `wss://api.cartesia.ai/tts/websocket?${params.toString()}`;
  }
}
