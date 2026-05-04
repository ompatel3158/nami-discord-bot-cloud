import { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } from "discord.js";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import cron from "node-cron";
import { createCommands, type BotCommand, type CommandContext } from "./bot-commands.js";
import { AUDIO_DIR, DATA_DIR, loadConfig } from "./config.js";
import { AiService } from "./services/ai-service.js";
import { GameService } from "./services/game-service.js";
import { SupabaseStorage } from "./services/supabase-storage.js";
import { VoiceService } from "./services/voice-service.js";
import { AppStorage, type StorageProvider } from "./storage.js";
import { formatCitationBlock, respond, splitMessage } from "./utils.js";

const config = loadConfig();

function ensureRuntimeDirectories(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(AUDIO_DIR, { recursive: true });
}

function createStorageBackend(): StorageProvider {
  if (!config.useSupabaseStorage) {
    console.log("[Storage] Using local JSON storage.");
    return new AppStorage();
  }

  if (!SupabaseStorage.isConfigured(config)) {
    console.warn(
      "[Storage] USE_SUPABASE_STORAGE is enabled, but SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing. Falling back to local JSON storage."
    );
    return new AppStorage();
  }

  console.log("[Storage] Using Supabase storage.");
  return new SupabaseStorage(config);
}

function readEnvFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

ensureRuntimeDirectories();
const storage = createStorageBackend();
const games = new GameService();
const ai = new AiService(config);
const voicePlayer = new VoiceService();

const context: CommandContext = {
  config,
  storage,
  games,
  ai,
  voicePlayer
};

const commands = createCommands();
const commandMap = new Map<string, BotCommand>(commands.map((command: BotCommand) => [command.data.name, command]));
const lastAutoVoiceSpeakerByGuild = new Map<string, string>();
let keepaliveCronStarted = false;

interface SendMessageIntent {
  targetToken: string;
  draftMessage: string;
  skipEditing: boolean;
}

interface DirectSayIntent {
  targetToken?: string;
  draftMessage: string;
  skipEditing: boolean;
}

function clearGuildAutoVoiceState(guildId: string): void {
  lastAutoVoiceSpeakerByGuild.delete(guildId);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeChannelLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDraftEditPreference(draftMessage: string): { text: string; skipEditing: boolean } {
  const skipEditing =
    /\b(?:dont|don't|do\s+not)\s+edit(?:\s+it)?\b/i.test(draftMessage) ||
    /\b(?:no|without)\s+edit(?:ing)?\b/i.test(draftMessage);

  const text = normalizeWhitespace(
    draftMessage
      .replace(/\b(?:dont|don't|do\s+not)\s+edit(?:\s+it)?\b/gi, " ")
      .replace(/\b(?:no|without)\s+edit(?:ing)?\b/gi, " ")
  );

  return { text, skipEditing };
}

function looksLikeChannelToken(token: string): boolean {
  return /^<#\d+>$/.test(token) || token.startsWith("#") || /[|┃]/.test(token);
}

function parseSendMessageIntent(prompt: string): SendMessageIntent | null {
  const normalizedPrompt = normalizeWhitespace(prompt);
  const match = normalizedPrompt.match(/^send\s+(?:msg|message)\s+to\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const remainder = match[1].trim();
  if (!remainder) {
    return null;
  }

  const [rawTargetToken, ...restTokens] = remainder.split(/\s+/);
  const targetToken = rawTargetToken.replace(/[.,!?]$/, "").trim();
  let draftMessage = restTokens.join(" ").trim();
  draftMessage = draftMessage.replace(/^(?:say|saying|msg|message)\s+/i, "").trim();

  const parsedDraft = parseDraftEditPreference(draftMessage);
  draftMessage = parsedDraft.text;

  if (!targetToken || !draftMessage) {
    return null;
  }

  return {
    targetToken,
    draftMessage,
    skipEditing: parsedDraft.skipEditing
  };
}

function parseDirectSayIntent(prompt: string): DirectSayIntent | null {
  const normalizedPrompt = normalizeWhitespace(prompt);
  if (/^send\s+(?:msg|message)\s+to\b/i.test(normalizedPrompt)) {
    return null;
  }

  const match = normalizedPrompt.match(/^say\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const parsedDraft = parseDraftEditPreference(match[1]);
  if (!parsedDraft.text) {
    return null;
  }

  const draftTokens = parsedDraft.text.split(/\s+/);
  if (draftTokens.length >= 2) {
    const maybeTargetToken = draftTokens[0].replace(/[.,!?]$/, "").trim();
    if (looksLikeChannelToken(maybeTargetToken)) {
      const messageWithoutTarget = normalizeWhitespace(draftTokens.slice(1).join(" "));
      if (messageWithoutTarget) {
        return {
          targetToken: maybeTargetToken,
          draftMessage: messageWithoutTarget,
          skipEditing: parsedDraft.skipEditing
        };
      }
    }
  }

  return {
    draftMessage: parsedDraft.text,
    skipEditing: parsedDraft.skipEditing
  };
}

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const body = commands.map((command: BotCommand) => command.data.toJSON());

  const application = (await rest.get(Routes.currentApplication())) as { id?: string; name?: string };
  if (!application?.id) {
    throw new Error("Unable to resolve application metadata from the Discord token.");
  }

  if (application.id !== config.discordClientId) {
    throw new Error(
      `DISCORD_CLIENT_ID mismatch: env has ${config.discordClientId}, but token belongs to application ${application.id} (${application.name ?? "unknown"}).`
    );
  }

  if (config.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), {
      body
    });
    console.log(`Registered ${body.length} guild command(s) for ${config.discordGuildId}.`);
    await rest.put(Routes.applicationCommands(config.discordClientId), { body });
    console.log(`Registered ${body.length} global command(s).`);
    console.log("Guild commands update immediately; global commands can take a few minutes to appear in other servers.");
    return;
  }

  await rest.put(Routes.applicationCommands(config.discordClientId), { body });
  console.log(`Registered ${body.length} global command(s).`);
  console.log("Global command updates may take a few minutes to appear in Discord. Set DISCORD_GUILD_ID for instant dev updates.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`Nami is online as ${client.user?.tag ?? "unknown user"}.`);
});

function startHealthServer(): void {
  const rawPort = process.env.PORT;
  if (!rawPort) {
    return;
  }

  const port = Number(rawPort);
  if (!Number.isFinite(port) || port <= 0) {
    console.warn(`[Health] Ignoring invalid PORT value: ${rawPort}`);
    return;
  }

  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    if (path === "/" || path === "/health" || path === "/healthz") {
      const payload = JSON.stringify({
        ok: true,
        botReady: client.isReady(),
        ttsEnabled: context.ai?.isTtsAvailable() ?? false,
        uptimeSeconds: Math.floor(process.uptime())
      });
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(payload);
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: "not_found" }));
  });

  server.listen(port, () => {
    console.log(`[Health] Listening on port ${port}.`);
  });
}

function startInternalKeepaliveCron(): void {
  if (keepaliveCronStarted) {
    return;
  }

  const enabledByDefault = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const enabled = readEnvFlag("INTERNAL_KEEPALIVE_ENABLED", enabledByDefault);
  if (!enabled) {
    return;
  }

  const intervalMinutes = Math.max(1, Math.min(59, readEnvInt("INTERNAL_KEEPALIVE_INTERVAL_MINUTES", 14)));

  const explicitTarget = process.env.INTERNAL_KEEPALIVE_URL?.trim();
  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  const localPort = process.env.PORT?.trim();
  const targetUrl =
    explicitTarget ||
    (renderExternalUrl ? `${renderExternalUrl.replace(/\/$/, "")}/healthz` : undefined) ||
    (localPort ? `http://127.0.0.1:${localPort}/healthz` : undefined);

  if (!targetUrl) {
    console.warn("[Keepalive] Internal keepalive cron is enabled but no target URL could be resolved.");
    return;
  }

  const cronExpression = `*/${intervalMinutes} * * * *`;
  cron.schedule(cronExpression, () => {
    void (async () => {
      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "Cache-Control": "no-store"
          }
        });

        console.log(`[Keepalive] Pinged ${targetUrl} -> ${response.status}`);
      } catch (error) {
        console.error("[Keepalive] Internal keepalive ping failed", error);
      }
    })();
  });

  keepaliveCronStarted = true;
  console.log(`[Keepalive] Internal cron enabled (${cronExpression}) targeting ${targetUrl}.`);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    return;
  }

  try {
    await command.execute(interaction, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong while handling that command.";
    console.error(error);

    try {
      await respond(interaction, `Nami hit a snag: ${message}`, { ephemeral: true });
    } catch (replyError) {
      console.error("Failed to send error response", replyError);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!client.user) {
    return;
  }

  if (message.author.bot || !message.guildId) {
    return;
  }

  const settings = await storage.getGuildSettings(message.guildId);

  if (context.ai && context.ai.isTtsAvailable() && context.voicePlayer && settings.features.tts && settings.autoVoiceReadEnabled) {
    try {
      const member = message.member ?? (message.guild ? await message.guild.members.fetch(message.author.id) : null);
      const memberVoiceChannelId = member?.voice.channelId;

      if (member && memberVoiceChannelId) {
        let connectedChannelId = context.voicePlayer.getConnectedChannelId(message.guildId);

        if (!connectedChannelId && settings.autoVoiceJoinEnabled) {
          const included = settings.autoVoiceJoinIncludeChannelIds;
          const excluded = settings.autoVoiceJoinExcludeChannelIds;
          const blockedByInclude = included.length > 0 && !included.includes(memberVoiceChannelId);
          const blockedByExclude = excluded.includes(memberVoiceChannelId);

          if (!blockedByInclude && !blockedByExclude) {
            await context.voicePlayer.ensureConnection(member);
            connectedChannelId = context.voicePlayer.getConnectedChannelId(message.guildId);
          }
        }

        if (connectedChannelId && connectedChannelId === memberVoiceChannelId) {
          const cleaned = message.cleanContent.trim();

          // Build a natural spoken description for attachments when there's no text,
          // or when the message is only a bare URL (will be cleaned by preprocessText anyway)
          let attachmentLabel = "";
          if (message.attachments.size > 0) {
            const counts = { image: 0, video: 0, audio: 0, file: 0 };
            for (const att of message.attachments.values()) {
              const ct = att.contentType ?? "";
              if (ct.startsWith("image/")) counts.image++;
              else if (ct.startsWith("video/")) counts.video++;
              else if (ct.startsWith("audio/")) counts.audio++;
              else counts.file++;
            }
            const parts: string[] = [];
            if (counts.image > 0) parts.push(counts.image === 1 ? "an image" : `${counts.image} images`);
            if (counts.video > 0) parts.push(counts.video === 1 ? "a video" : `${counts.video} videos`);
            if (counts.audio > 0) parts.push(counts.audio === 1 ? "an audio file" : `${counts.audio} audio files`);
            if (counts.file > 0) parts.push(counts.file === 1 ? "a file" : `${counts.file} files`);
            attachmentLabel = `sent ${parts.join(" and ")}`;
          }

          const spokenContent = cleaned
            ? (attachmentLabel ? `${cleaned}, with ${attachmentLabel.replace(/^sent /, "")}` : cleaned)
            : attachmentLabel;

          if (spokenContent) {
            const preferences = await storage.getUserPreferences(message.author.id);
            const previousSpeaker = lastAutoVoiceSpeakerByGuild.get(message.guildId);
            const speakerName = member.displayName || message.author.username;
            const speakerChanged = previousSpeaker !== message.author.id;
            const cooldownLeft = context.ai.getTtsCooldownRemainingSeconds(message.author.id);

            if (cooldownLeft <= 0) {
              const estimatedCharacters = Math.max(0, Math.min(spokenContent.length, config.ttsMaxChars));
              const limitResult = await storage.trackTtsUsageAndCheckLimit({
                guildId: message.guildId,
                userId: message.author.id,
                characters: estimatedCharacters,
                userRequestLimit: config.ttsDailyUserRequestLimit,
                userCharacterLimit: config.ttsDailyUserCharacterLimit,
                guildRequestLimit: config.ttsDailyGuildRequestLimit,
                guildCharacterLimit: config.ttsDailyGuildCharacterLimit,
                globalRequestLimit: config.ttsDailyGlobalRequestLimit,
                globalCharacterLimit: config.ttsDailyGlobalCharacterLimit
              });

              if (!limitResult.allowed) {
                console.warn(
                  `[AutoRead] TTS limit reached for user ${message.author.id} in guild ${message.guildId}: ${limitResult.reason ?? "limit exceeded"}`
                );
                return;
              }

              context.ai.markTtsCooldown(message.author.id);

              const filePath = await context.ai.synthesizeSpeech({
                text: spokenContent,
                voiceId: preferences.voice,
                language: preferences.language,
                fallbackLanguage: settings.ttsLanguage,
                speed: preferences.ttsSpeed,
                userId: message.author.id,
                speakerName,
                includeSpeakerPrefix: speakerChanged
              });
              await context.voicePlayer.enqueue(member, filePath, preferences.ttsSpeed);
              lastAutoVoiceSpeakerByGuild.set(message.guildId, message.author.id);
            }
          }
        }
      }
    } catch (error) {
      console.error("Auto VC speech failure", error);
      if (!context.ai.isTtsAvailable()) {
        await storage.updateGuildSettings(message.guildId, (current) => {
          current.autoVoiceReadEnabled = false;
          return current;
        });
        await message.channel.send({
          content: "Auto-read was disabled because no TTS provider is currently available. Fix your TTS API keys/quotas, then re-enable with /voice auto-read enabled:true.",
          allowedMentions: { parse: [] }
        });
      }
    }
  }

  if (!context.ai) {
    return;
  }

  if (!settings.features.ai) {
    return;
  }

  const mentioned = message.mentions.users.has(client.user.id);
  if (!mentioned) {
    return;
  }

  const cleanedPrompt = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
    .trim();

  if (!cleanedPrompt) {
    await message.reply({
      content: "Mention me with a message and I'll chat back. Example: `@Nami explain slash commands`",
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  const sendCommandPrefixDetected = /^send\s+(?:msg|message)\s+to\b/i.test(cleanedPrompt);
  const sendIntent = parseSendMessageIntent(cleanedPrompt);
  const directSayIntent = parseDirectSayIntent(cleanedPrompt);
  const effectiveSendIntent = sendIntent ?? (directSayIntent?.targetToken
    ? {
        targetToken: directSayIntent.targetToken,
        draftMessage: directSayIntent.draftMessage,
        skipEditing: directSayIntent.skipEditing
      }
    : null);

  if (sendCommandPrefixDetected && !sendIntent) {
    await message.reply({
      content: "Use this format: `@Nami send msg to #channel say your message`. Add `don't edit` to keep your text exactly as typed.",
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  if (effectiveSendIntent && message.guild) {
    const mentionMatch = effectiveSendIntent.targetToken.match(/^<#(\d+)>$/);
    const explicitName = effectiveSendIntent.targetToken.startsWith("#")
      ? effectiveSendIntent.targetToken.slice(1)
      : effectiveSendIntent.targetToken;
    const normalizedExplicitName = normalizeChannelLookupKey(explicitName);

    let targetChannel = mentionMatch
      ? await message.guild.channels.fetch(mentionMatch[1]).catch(() => null)
      : null;

    if (!targetChannel && explicitName) {
      const loweredExplicitName = explicitName.toLowerCase();
      targetChannel =
        message.guild.channels.cache.find((channel) => channel.name.toLowerCase() === loweredExplicitName) ??
        message.guild.channels.cache.find(
          (channel) => normalizeChannelLookupKey(channel.name) === normalizedExplicitName
        ) ??
        null;
    }

    if (!targetChannel) {
      await message.reply({
        content: `I couldn't find channel ${effectiveSendIntent.targetToken}. Mention the channel like <#id> or use an exact #name.`,
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    if (!targetChannel.isTextBased() || typeof targetChannel.send !== "function") {
      await message.reply({
        content: `I can only send messages to text channels. ${effectiveSendIntent.targetToken} is not sendable.`,
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    const botPermissions = targetChannel.permissionsFor(client.user.id);
    if (
      !botPermissions?.has(PermissionFlagsBits.ViewChannel) ||
      !botPermissions.has(PermissionFlagsBits.SendMessages)
    ) {
      await message.reply({
        content: `I don't have permission to send messages in <#${targetChannel.id}>.`,
        allowedMentions: { repliedUser: false, parse: [] }
      });
      return;
    }

    if (message.member) {
      const userPermissions = targetChannel.permissionsFor(message.member);
      if (
        !userPermissions?.has(PermissionFlagsBits.ViewChannel) ||
        !userPermissions.has(PermissionFlagsBits.SendMessages)
      ) {
        await message.reply({
          content: `You don't have permission to send messages in <#${targetChannel.id}>.`,
          allowedMentions: { repliedUser: false, parse: [] }
        });
        return;
      }
    }

    const preferences = await storage.getUserPreferences(message.author.id);
    let outgoingText = effectiveSendIntent.draftMessage;
    let usedEnhancement = false;

    if (!effectiveSendIntent.skipEditing) {
      try {
        outgoingText = await context.ai.enhanceOutgoingMessage({
          draft: effectiveSendIntent.draftMessage,
          userId: message.author.id,
          preferences,
          instructions:
            "Polish this Discord message for clarity and flow, but keep the same intent and key details. Do not add extra facts."
        });
        usedEnhancement = true;
      } catch (error) {
        console.warn("Message enhancement failed, sending original text", error);
      }
    }

    const chunks = splitMessage(outgoingText);
    await targetChannel.send({
      content: chunks[0],
      allowedMentions: { parse: [] }
    });

    for (const chunk of chunks.slice(1)) {
      await targetChannel.send({
        content: chunk,
        allowedMentions: { parse: [] }
      });
    }

    await message.reply({
      content: `Sent to <#${targetChannel.id}>${usedEnhancement ? " (AI-enhanced)" : ""}.`,
      allowedMentions: { repliedUser: false, parse: [] }
    });
    return;
  }

  if (directSayIntent && !directSayIntent.targetToken) {
    const preferences = await storage.getUserPreferences(message.author.id);
    let outgoingText = directSayIntent.draftMessage;

    if (!directSayIntent.skipEditing) {
      try {
        outgoingText = await context.ai.enhanceOutgoingMessage({
          draft: directSayIntent.draftMessage,
          userId: message.author.id,
          preferences,
          instructions:
            "Polish this Discord message for clarity and flow, but keep the same intent and key details. Do not add extra facts."
        });
      } catch (error) {
        console.warn("Direct say enhancement failed, sending original text", error);
      }
    }

    const chunks = splitMessage(outgoingText);
    await message.channel.send({
      content: chunks[0],
      allowedMentions: { parse: [] }
    });

    for (const chunk of chunks.slice(1)) {
      await message.channel.send({
        content: chunk,
        allowedMentions: { parse: [] }
      });
    }

    return;
  }

  try {
    await message.channel.sendTyping();
    const preferences = await storage.getUserPreferences(message.author.id);
    const history = await storage.getConversation(message.guildId, message.author.id);
    const result = await context.ai.answerQuestion({
      prompt: cleanedPrompt,
      history,
      searchWeb: settings.features.search && preferences.searchEnabledByDefault,
      systemPrompt: settings.systemPrompt,
      preferences,
      userId: message.author.id
    });

    await storage.appendConversation(message.guildId, message.author.id, {
      role: "user",
      content: cleanedPrompt,
      createdAt: new Date().toISOString()
    });
    await storage.appendConversation(message.guildId, message.author.id, {
      role: "assistant",
      content: result.text,
      createdAt: new Date().toISOString()
    });

    const chunks = splitMessage(`${result.text}${formatCitationBlock(result.citations)}`);
    await message.reply({
      content: chunks[0],
      allowedMentions: { repliedUser: false, parse: [] }
    });

    for (const chunk of chunks.slice(1)) {
      await message.channel.send({
        content: chunk,
        allowedMentions: { parse: [] }
      });
    }
  } catch (error) {
    console.error("Message chat failure", error);
    await message.reply({
      content: "I hit a snag while replying. Check the bot logs and API setup, then try again.",
      allowedMentions: { repliedUser: false, parse: [] }
    });
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (!context.voicePlayer) {
    return;
  }

  const guildId = newState.guild.id;
  const connectedChannelId = context.voicePlayer.getConnectedChannelId(guildId);
  if (!connectedChannelId) {
    return;
  }

  if (oldState.channelId !== connectedChannelId && newState.channelId !== connectedChannelId) {
    return;
  }

  const channel = await newState.guild.channels.fetch(connectedChannelId).catch(() => null);
  if (!channel || !("isVoiceBased" in channel) || !channel.isVoiceBased()) {
    return;
  }

  const humans = channel.members.filter((member) => !member.user.bot);
  if (humans.size === 0) {
    await context.voicePlayer.leave(guildId);
    clearGuildAutoVoiceState(guildId);
    console.log(`Auto-disconnected from VC in guild ${guildId} because no humans remained.`);
  }
});

async function runStartupChecks(): Promise<void> {
  if (!context.ai) {
    return;
  }

  try {
    const status = await context.ai.runTtsStartupCheck();
    console.log(`[Startup] ${status}`);
    if (!context.ai.isTtsAvailable()) {
      console.log("[Startup] No TTS provider is enabled; TTS commands and auto-read will be skipped.");
    } else if (context.ai.isGoogleTtsAvailable()) {
      console.log("[Startup] Google TTS is active.");
    }
  } catch (error) {
    console.error("[Startup] TTS startup check failed", error);
  }
}

async function bootstrap(): Promise<void> {
  startHealthServer();
  startInternalKeepaliveCron();
  await runStartupChecks();
  await registerCommands();
  await client.login(config.discordToken);
}

void bootstrap().catch((error) => {
  console.error("Failed to start Nami", error);
  process.exitCode = 1;
});


