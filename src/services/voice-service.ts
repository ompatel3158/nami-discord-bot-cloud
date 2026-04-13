import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection
} from "@discordjs/voice";
import type { GuildMember } from "discord.js";

interface QueueItem {
  filePath: string;
  speed: number;
}

interface VoiceSession {
  channelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: QueueItem[];
  busy: boolean;
  activeProcess?: ChildProcessWithoutNullStreams;
  activeFilePath?: string;
}

export class VoiceService {
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly resolvedFfmpegPath = ffmpegPath as unknown as string | undefined;

  async ensureConnection(member: GuildMember): Promise<void> {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      throw new Error("Join a voice channel first so Nami knows where to speak.");
    }

    const guildId = member.guild.id;
    const existing = this.sessions.get(guildId);
    if (existing && existing.channelId === voiceChannel.id) {
      return;
    }

    if (existing) {
      await this.leave(guildId);
    }

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: member.guild.voiceAdapterCreator,
      selfDeaf: false
    });

    connection.subscribe(player);
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const session: VoiceSession = {
      channelId: voiceChannel.id,
      connection,
      player,
      queue: [],
      busy: false
    };

    player.on("error", async () => {
      await this.finishCurrent(guildId);
      await this.playNext(guildId);
    });

    player.on(AudioPlayerStatus.Idle, async () => {
      await this.finishCurrent(guildId);
      await this.playNext(guildId);
    });

    this.sessions.set(guildId, session);
  }

  async enqueue(member: GuildMember, filePath: string, speed = 1): Promise<number> {
    await this.ensureConnection(member);
    const session = this.sessions.get(member.guild.id);
    if (!session) {
      throw new Error("I couldn't create a voice session for that server.");
    }

    session.queue.push({ filePath, speed });
    await this.playNext(member.guild.id);
    return session.queue.length + (session.busy ? 1 : 0);
  }

  async stop(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) {
      return;
    }

    session.queue = [];
    session.player.stop(true);
    await this.finishCurrent(guildId);
  }

  async skip(guildId: string): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (!session || !session.busy) {
      return false;
    }

    session.player.stop(true);
    return true;
  }

  getQueueLength(guildId: string): number {
    const session = this.sessions.get(guildId);
    if (!session) {
      return 0;
    }

    return session.queue.length;
  }

  isPlaying(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    return Boolean(session?.busy);
  }

  async leave(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) {
      return;
    }

    await this.stop(guildId);
    session.connection.destroy();
    this.sessions.delete(guildId);
  }

  hasConnection(guildId: string): boolean {
    return this.sessions.has(guildId);
  }

  getConnectedChannelId(guildId: string): string | undefined {
    return this.sessions.get(guildId)?.channelId;
  }

  private async playNext(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session || session.busy) {
      return;
    }

    const item = session.queue.shift();
    if (!item) {
      return;
    }

    session.busy = true;
    session.activeFilePath = item.filePath;
    session.activeProcess = this.spawnFfmpeg(item.filePath, item.speed);

    const activeProcess = session.activeProcess;
    if (!activeProcess) {
      await this.finishCurrent(guildId);
      throw new Error("Failed to create the FFmpeg process.");
    }

    const stdout = activeProcess.stdout;
    if (!stdout) {
      await this.finishCurrent(guildId);
      throw new Error("Failed to start the audio stream.");
    }

    const resource = createAudioResource(stdout, {
      inputType: StreamType.Raw
    });

    session.player.play(resource);
  }

  private spawnFfmpeg(filePath: string, speed: number): ChildProcessWithoutNullStreams {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-filter:a",
      this.buildTempoFilter(speed),
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "pipe:1"
    ];

    const candidates = [this.resolvedFfmpegPath, "ffmpeg"].filter(Boolean) as string[];
    let lastError: unknown;

    for (const bin of candidates) {
      try {
        const proc = spawn(bin, args);
        if (bin !== this.resolvedFfmpegPath) {
          console.warn(`Falling back to '${bin}' for voice playback.`);
        }
        return proc;
      } catch (error) {
        lastError = error;
      }
    }

    const detail = lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : "unknown spawn error";
    throw new Error(`Unable to start FFmpeg for voice playback (${detail}). Install FFmpeg or fix ffmpeg-static.`);
  }

  private async finishCurrent(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) {
      return;
    }

    session.activeProcess?.kill();
    session.activeProcess = undefined;
    session.busy = false;

    if (session.activeFilePath) {
      try {
        if (this.shouldDeletePlaybackFile(session.activeFilePath)) {
          await fs.unlink(session.activeFilePath);
        }
      } catch {
        // Best-effort cleanup for generated audio files.
      }
    }

    session.activeFilePath = undefined;
  }

  private buildTempoFilter(speed: number): string {
    let remaining = Math.min(Math.max(speed, 0.25), 4);
    const filters: string[] = [];

    while (remaining > 2) {
      filters.push("atempo=2.00");
      remaining /= 2;
    }

    while (remaining < 0.5) {
      filters.push("atempo=0.50");
      remaining /= 0.5;
    }

    filters.push(`atempo=${remaining.toFixed(2)}`);
    return filters.join(",");
  }

  private shouldDeletePlaybackFile(filePath: string): boolean {
    const normalized = path.normalize(filePath).toLowerCase();
    const audioCacheToken = `${path.sep}audio_cache${path.sep}`;
    return !normalized.includes(audioCacheToken);
  }
}
