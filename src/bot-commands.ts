import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { DEFAULT_USER_PREFERENCES, type AppConfig } from "./config.js";
import { AiService } from "./services/ai-service.js";
import { GameService } from "./services/game-service.js";
import { VoiceService } from "./services/voice-service.js";
import type { StorageProvider } from "./storage.js";
import type { AiModelMode, FeatureFlag } from "./types.js";
import { clamp, formatCitationBlock, respond, requireGuildId } from "./utils.js";

export interface CommandContext {
  config: AppConfig;
  storage: StorageProvider;
  games: GameService;
  ai: AiService | null;
  voicePlayer: VoiceService | null;
}

export interface BotCommand {
  data: { name: string; toJSON(): unknown };
  execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void>;
}

const featureChoices: Array<{ name: string; value: FeatureFlag }> = [
  { name: "AI", value: "ai" },
  { name: "Web Search", value: "search" },
  { name: "Games", value: "games" },
  { name: "Text To Speech", value: "tts" }
];

const modelChoices: Array<{ name: string; value: AiModelMode }> = [
  { name: "Smart (default)", value: "smart" },
  { name: "Uncensored (Venice)", value: "uncensored" }
];

async function requireFeature(
  interaction: ChatInputCommandInteraction,
  storage: StorageProvider,
  feature: FeatureFlag
): Promise<void> {
  const guildId = requireGuildId(interaction);
  const settings = await storage.getGuildSettings(guildId);
  if (!settings.features[feature]) throw new Error(`The ${feature.toUpperCase()} feature is disabled in this server.`);
}

async function fetchGuildMember(interaction: ChatInputCommandInteraction): Promise<GuildMember> {
  requireGuildId(interaction);
  if (!interaction.guild) throw new Error("This command needs to be used inside a server.");
  return interaction.guild.members.fetch(interaction.user.id);
}

export function createCommands(): BotCommand[] {
  const ask: BotCommand = {
    data: new SlashCommandBuilder().setName("ask").setDescription("Ask Nami an AI question.")
      .addStringOption((option) => option.setName("prompt").setDescription("What do you want to ask?").setRequired(true))
      .addBooleanOption((option) => option.setName("web").setDescription("Let Nami search the web before answering.").setRequired(false)),
    async execute(interaction, context) {
      await requireFeature(interaction, context.storage, "ai");
      if (!context.ai) throw new Error("No AI provider is configured yet. Set OPENROUTER_API_KEY (smart mode) and VENICE_API_KEY (uncensored mode).");
      const guildId = requireGuildId(interaction);
      const settings = await context.storage.getGuildSettings(guildId);
      const preferences = await context.storage.getUserPreferences(interaction.user.id);
      const prompt = interaction.options.getString("prompt", true);
      const searchWeb = interaction.options.getBoolean("web") ?? preferences.searchEnabledByDefault;
      if (searchWeb) await requireFeature(interaction, context.storage, "search");
      await respond(interaction, "Thinking...", { defer: true });
      const history = await context.storage.getConversation(guildId, interaction.user.id);
      const result = await context.ai.answerQuestion({ prompt, history, searchWeb, systemPrompt: settings.systemPrompt, preferences, userId: interaction.user.id });
      await context.storage.appendConversation(guildId, interaction.user.id, {
        role: "user",
        content: prompt,
        createdAt: new Date().toISOString()
      });
      await context.storage.appendConversation(guildId, interaction.user.id, {
        role: "assistant",
        content: result.text,
        createdAt: new Date().toISOString()
      });
      await respond(interaction, `${result.text}${formatCitationBlock(result.citations)}`);
    }
  };

  const search: BotCommand = {
    data: new SlashCommandBuilder().setName("search").setDescription("Search the web and summarize the results.")
      .addStringOption((option) => option.setName("query").setDescription("What should Nami search for?").setRequired(true)),
    async execute(interaction, context) {
      await requireFeature(interaction, context.storage, "search");
      if (!context.ai) throw new Error("No AI provider is configured yet. Set OPENROUTER_API_KEY (smart mode) and VENICE_API_KEY (uncensored mode).");
      const query = interaction.options.getString("query", true);
      const preferences = await context.storage.getUserPreferences(interaction.user.id);
      await respond(interaction, "Searching the web...", { defer: true });
      const result = await context.ai.searchWeb(query, preferences, interaction.user.id);
      await respond(interaction, `${result.text}${formatCitationBlock(result.citations)}`);
    }
  };

  const preferences: BotCommand = {
    data: new SlashCommandBuilder().setName("preferences").setDescription("Set your Nami preferences.")
      .addSubcommand((subcommand) => subcommand.setName("view").setDescription("Show your current settings."))
      .addSubcommand((subcommand) => subcommand.setName("voice").setDescription("Set your preferred ElevenLabs voice, Google voice, and playback speed.")
        .addStringOption((option) => option.setName("voice_id").setDescription("ElevenLabs voice ID from /tts voices").setRequired(false))
        .addStringOption((option) => option.setName("google_voice").setDescription("Google/Gemini voice name, or auto").setRequired(false))
        .addNumberOption((option) => option.setName("speed").setDescription("Playback speed from 0.7 to 1.2").setRequired(false)))
      .addSubcommand((subcommand) => subcommand.setName("voices").setDescription("Show voices and how to set one quickly."))
      .addSubcommand((subcommand) => subcommand.setName("model").setDescription("Choose your AI model behavior.")
        .addStringOption((option) => option.setName("mode").setDescription("Smart or uncensored").setRequired(true).addChoices(...modelChoices)))
      .addSubcommand((subcommand) => subcommand.setName("search").setDescription("Choose whether /ask should use web search by default.")
        .addBooleanOption((option) => option.setName("enabled").setDescription("Enable web search by default for your /ask command").setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName("language").setDescription("Set your preferred reply language.")
        .addStringOption((option) => option.setName("value").setDescription("Example: English, Hindi").setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName("reset").setDescription("Reset all your preferences.")),
    async execute(interaction, context) {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "view") {
        const current = await context.storage.getUserPreferences(interaction.user.id);
        await respond(interaction, [
          "Your preferences:",
          `Voice ID: **${current.voice || "auto"}**`,
          `Google voice: **${current.geminiVoice || "auto"}**`,
          `TTS speed: **${current.ttsSpeed}x**`,
          `Model mode: **${current.modelMode}**`,
          `Default web search: **${current.searchEnabledByDefault ? "on" : "off"}**`,
          `Language: **${current.language}**`
        ].join("\n"), { ephemeral: true });
        return;
      }
      if (subcommand === "voices") {
        if (!context.ai) throw new Error("No TTS provider is configured yet (set ELEVENLABS_API_KEY and/or GEMINI_API_KEY).");
        await respond(interaction, "Loading available voices...", { defer: true });
        const voices = await context.ai.listVoices();
        const googleVoices = context.ai.listGoogleVoices();
        const providerList = voices.slice(0, 20);
        const googleList = googleVoices.slice(0, 20);
        const providerText = providerList.length
          ? providerList.map((voiceInfo) => `- **${voiceInfo.name}** (${voiceInfo.category}): \`${voiceInfo.id}\``).join("\n")
          : "No provider voices were returned.";
        const googleText = googleList.length
          ? googleList.map((voiceInfo) => `- **${voiceInfo.name}**: \`${voiceInfo.id}\``).join("\n")
          : "No Google voices available.";
        await respond(interaction, [
          "Provider voices:",
          providerText,
          "",
          "Google/Gemini voices:",
          googleText,
          "",
          "Set defaults with: `/preferences voice voice_id:<id> google_voice:<name|auto>`"
        ].join("\n"), { ephemeral: true });
        return;
      }
      if (subcommand === "reset") {
        await context.storage.saveUserPreferences(interaction.user.id, DEFAULT_USER_PREFERENCES);
        await respond(interaction, "Your preferences have been reset to the defaults.", { ephemeral: true });
        return;
      }
      await context.storage.updateUserPreferences(interaction.user.id, (current) => {
        if (subcommand === "voice") {
          const voiceId = interaction.options.getString("voice_id");
          const googleVoice = interaction.options.getString("google_voice");
          const speed = interaction.options.getNumber("speed");
          if (voiceId !== null) current.voice = voiceId.trim();
          if (googleVoice !== null) current.geminiVoice = googleVoice.trim() || "auto";
          if (speed !== null) current.ttsSpeed = clamp(speed, 0.7, 1.2);
        }
        if (subcommand === "model") current.modelMode = interaction.options.getString("mode", true) as AiModelMode;
        if (subcommand === "search") current.searchEnabledByDefault = interaction.options.getBoolean("enabled", true);
        if (subcommand === "language") current.language = interaction.options.getString("value", true);
        return current;
      });
      const persisted = await context.storage.getUserPreferences(interaction.user.id);
      await respond(
        interaction,
        `Saved. Voice ID: **${persisted.voice || "auto"}**, Google voice: **${persisted.geminiVoice || "auto"}**, model: **${persisted.modelMode}**, language: **${persisted.language}**.`,
        { ephemeral: true }
      );
    }
  };

  const memory: BotCommand = {
    data: new SlashCommandBuilder().setName("memory").setDescription("View or clear your saved Nami conversation memory.")
      .addSubcommand((subcommand) => subcommand.setName("view").setDescription("Show your recent remembered messages.")
        .addIntegerOption((option) => option.setName("count").setDescription("How many messages to show").setRequired(false).setMinValue(4).setMaxValue(40)))
      .addSubcommand((subcommand) => subcommand.setName("clear").setDescription("Clear your remembered messages in this server.")),
    async execute(interaction, context) {
      const guildId = requireGuildId(interaction);
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "clear") {
        const cleared = await context.storage.clearConversation(guildId, interaction.user.id);
        await respond(interaction, `Cleared **${cleared}** conversation thread(s) for you in this server.`, { ephemeral: true });
        return;
      }

      const count = interaction.options.getInteger("count") ?? 12;
      const history = (await context.storage.getConversation(guildId, interaction.user.id)).slice(-count);
      if (history.length === 0) {
        await respond(interaction, "No saved conversation memory found yet for you in this server.", { ephemeral: true });
        return;
      }

      const lines = history.map((message, index) => {
        const role = message.role === "assistant" ? "Nami" : interaction.user.username;
        const text = message.content.replace(/\s+/g, " ").trim().slice(0, 180);
        return `${index + 1}. **${role}:** ${text}`;
      });

      await respond(interaction, ["Recent remembered conversation:", ...lines].join("\n"), { ephemeral: true });
    }
  };

  const game: BotCommand = {
    data: new SlashCommandBuilder().setName("game").setDescription("Play text-based mini games with Nami.")
      .addSubcommand((subcommand) => subcommand.setName("guess-start").setDescription("Start a number guessing game.")
        .addIntegerOption((option) => option.setName("max").setDescription("Highest possible number").setRequired(false).setMinValue(10).setMaxValue(500)))
      .addSubcommand((subcommand) => subcommand.setName("guess-pick").setDescription("Make a guess in the active number game.")
        .addIntegerOption((option) => option.setName("number").setDescription("Your guess").setRequired(true).setMinValue(1).setMaxValue(500)))
      .addSubcommand((subcommand) => subcommand.setName("trivia").setDescription("Start or answer a trivia round.")
        .addStringOption((option) => option.setName("answer").setDescription("A, B, C, D, or the full choice").setRequired(false)))
      .addSubcommand((subcommand) => subcommand.setName("scramble").setDescription("Start or answer a word scramble round.")
        .addStringOption((option) => option.setName("answer").setDescription("Your guess").setRequired(false)))
      .addSubcommand((subcommand) => subcommand.setName("rps").setDescription("Play rock paper scissors.")
        .addStringOption((option) => option.setName("choice").setDescription("Your move").setRequired(true).addChoices(
          { name: "Rock", value: "rock" }, { name: "Paper", value: "paper" }, { name: "Scissors", value: "scissors" })))
      .addSubcommand((subcommand) => subcommand.setName("coinflip").setDescription("Flip a coin.")),
    async execute(interaction, context) {
      await requireFeature(interaction, context.storage, "games");
      const guildId = requireGuildId(interaction);
      const key = `${guildId}:${interaction.user.id}`;
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "guess-start") {
        const max = interaction.options.getInteger("max") ?? 100;
        context.games.startGuess(key, max);
        await respond(interaction, `Guess game started. I'm thinking of a number from **1** to **${max}**. Use \`/game guess-pick\` to make guesses.`);
        return;
      }
      if (subcommand === "guess-pick") {
        await respond(interaction, context.games.guess(key, interaction.options.getInteger("number", true)).message);
        return;
      }
      if (subcommand === "trivia") {
        const answer = interaction.options.getString("answer") ?? undefined;
        if (!answer) { await respond(interaction, context.games.formatTriviaPrompt(context.games.getOrCreateTrivia(key))); return; }
        await respond(interaction, context.games.answerTrivia(key, answer).message); return;
      }
      if (subcommand === "scramble") {
        const answer = interaction.options.getString("answer") ?? undefined;
        if (!answer) { const state = context.games.getOrCreateScramble(key); await respond(interaction, `Unscramble this word: **${state.scrambled}**\nReply with \`/game scramble answer:<word>\`.`); return; }
        await respond(interaction, context.games.answerScramble(key, answer).message); return;
      }
      if (subcommand === "rps") { await respond(interaction, context.games.playRockPaperScissors(interaction.options.getString("choice", true))); return; }
      await respond(interaction, `The coin landed on **${context.games.flipCoin()}**.`);
    }
  };

  const voice: BotCommand = {
    data: new SlashCommandBuilder().setName("voice").setDescription("Manage Nami in voice channels.")
      .addSubcommand((subcommand) => subcommand.setName("join").setDescription("Join your voice channel."))
      .addSubcommand((subcommand) => subcommand.setName("leave").setDescription("Leave the current voice channel."))
      .addSubcommand((subcommand) => subcommand.setName("auto-read").setDescription("Automatically read chat messages in VC.")
        .addBooleanOption((option) => option.setName("enabled").setDescription("Enable or disable auto-read").setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName("language").setDescription("Set server language for TTS and auto-read.")
        .addStringOption((option) => option.setName("value").setDescription("Example: Hindi, English").setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName("autojoin").setDescription("Auto-join voice when someone types in chat.")
        .addStringOption((option) => option.setName("action").setDescription("What to update").setRequired(true).addChoices(
          { name: "Enable auto-join", value: "enable" },
          { name: "Disable auto-join", value: "disable" },
          { name: "Include a VC", value: "include" },
          { name: "Exclude a VC", value: "exclude" },
          { name: "Remove included VC", value: "remove-include" },
          { name: "Remove excluded VC", value: "remove-exclude" },
          { name: "Clear include list", value: "clear-includes" },
          { name: "Clear exclude list", value: "clear-excludes" },
          { name: "Show status", value: "status" }
        ))
        .addChannelOption((option) => option.setName("channel").setDescription("Voice channel for include/exclude actions").addChannelTypes(ChannelType.GuildVoice).setRequired(false))),
    async execute(interaction, context) {
      await requireFeature(interaction, context.storage, "tts");
      if (!context.voicePlayer) throw new Error("Voice playback service is unavailable right now.");
      const guildId = requireGuildId(interaction);
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "join") {
        await context.voicePlayer.ensureConnection(await fetchGuildMember(interaction));
        await respond(interaction, "Joined your voice channel.");
        return;
      }
      if (subcommand === "auto-read") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const settings = await context.storage.updateGuildSettings(guildId, (current) => {
          current.autoVoiceReadEnabled = enabled;
          return current;
        });
        await respond(interaction, `Auto-read is now **${enabled ? "enabled" : "disabled"}** for this server. Language: **${settings.ttsLanguage}**.`);
        return;
      }
      if (subcommand === "language") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          throw new Error("You need Manage Server permission to change the server TTS language.");
        }
        const value = interaction.options.getString("value", true).trim();
        const settings = await context.storage.updateGuildSettings(guildId, (current) => {
          current.ttsLanguage = value;
          return current;
        });
        await respond(
          interaction,
          `Server TTS language is now **${settings.ttsLanguage}**. This affects both /tts say and voice auto-read.`,
          { ephemeral: true }
        );
        return;
      }
      if (subcommand === "autojoin") {
        const action = interaction.options.getString("action", true);
        const selected = interaction.options.getChannel("channel");
        const channelId = selected?.id;
        const settings = await context.storage.updateGuildSettings(guildId, (current) => {
          if (action === "enable") {
            current.autoVoiceJoinEnabled = true;
            // Auto-join without auto-read is confusing in practice, so enable both together.
            current.autoVoiceReadEnabled = true;
          }
          if (action === "disable") current.autoVoiceJoinEnabled = false;
          if (action === "include" && channelId && !current.autoVoiceJoinIncludeChannelIds.includes(channelId)) {
            current.autoVoiceJoinIncludeChannelIds.push(channelId);
          }
          if (action === "exclude" && channelId && !current.autoVoiceJoinExcludeChannelIds.includes(channelId)) {
            current.autoVoiceJoinExcludeChannelIds.push(channelId);
          }
          if (action === "remove-include" && channelId) {
            current.autoVoiceJoinIncludeChannelIds = current.autoVoiceJoinIncludeChannelIds.filter((id) => id !== channelId);
          }
          if (action === "remove-exclude" && channelId) {
            current.autoVoiceJoinExcludeChannelIds = current.autoVoiceJoinExcludeChannelIds.filter((id) => id !== channelId);
          }
          if (action === "clear-includes") current.autoVoiceJoinIncludeChannelIds = [];
          if (action === "clear-excludes") current.autoVoiceJoinExcludeChannelIds = [];
          return current;
        });

        const includeList = settings.autoVoiceJoinIncludeChannelIds.length
          ? settings.autoVoiceJoinIncludeChannelIds.map((id) => `<#${id}>`).join(", ")
          : "none";
        const excludeList = settings.autoVoiceJoinExcludeChannelIds.length
          ? settings.autoVoiceJoinExcludeChannelIds.map((id) => `<#${id}>`).join(", ")
          : "none";

        if ((action === "include" || action === "exclude" || action === "remove-include" || action === "remove-exclude") && !channelId) {
          throw new Error("That action needs a voice channel.");
        }

        await respond(interaction, [
          "Auto-join settings updated.",
          `Enabled: **${settings.autoVoiceJoinEnabled ? "yes" : "no"}**`,
          `Auto-read: **${settings.autoVoiceReadEnabled ? "yes" : "no"}**`,
          `TTS language: **${settings.ttsLanguage}**`,
          `Included VCs: ${includeList}`,
          `Excluded VCs: ${excludeList}`
        ].join("\n"));
        return;
      }
      await context.voicePlayer.leave(guildId);
      await respond(interaction, "Left the voice channel and cleared the queue.");
    }
  };

  const tts: BotCommand = {
    data: new SlashCommandBuilder().setName("tts").setDescription("Speak text in voice chat using available TTS providers.")
      .addSubcommand((subcommand) => subcommand.setName("say").setDescription("Speak a message in your voice channel.")
        .addStringOption((option) => option.setName("text").setDescription("What should Nami say?").setRequired(true))
        .addStringOption((option) => option.setName("voice_id").setDescription("Optional ElevenLabs voice ID").setRequired(false))
        .addStringOption((option) => option.setName("google_voice").setDescription("Optional Google/Gemini voice name or auto").setRequired(false))
        .addNumberOption((option) => option.setName("speed").setDescription("Playback speed from 0.7 to 1.2").setRequired(false)))
      .addSubcommand((subcommand) => subcommand.setName("stop").setDescription("Stop speaking and clear the queue."))
      .addSubcommand((subcommand) => subcommand.setName("voices").setDescription("List available TTS voices (provider + Google).")),
    async execute(interaction, context) {
      await requireFeature(interaction, context.storage, "tts");
      if (!context.ai) throw new Error("No TTS provider is configured yet (set ELEVENLABS_API_KEY and/or GEMINI_API_KEY).");
      if (!context.voicePlayer) throw new Error("Voice playback service is unavailable right now.");
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "voices") {
        await respond(interaction, "Loading available voices...", { defer: true });
        const voices = await context.ai.listVoices();
        const googleVoices = context.ai.listGoogleVoices();
        const providerText = voices.length
          ? voices.slice(0, 15).map((voiceInfo) => `- **${voiceInfo.name}** (${voiceInfo.category}): \`${voiceInfo.id}\``).join("\n")
          : "No provider voices were returned.";
        const googleText = googleVoices.length
          ? googleVoices.slice(0, 15).map((voiceInfo) => `- **${voiceInfo.name}**: \`${voiceInfo.id}\``).join("\n")
          : "No Google voices available.";
        await respond(interaction, `Provider voices:\n${providerText}\n\nGoogle/Gemini voices:\n${googleText}`, { ephemeral: true });
        return;
      }
      const guildId = requireGuildId(interaction);
      const guildSettings = await context.storage.getGuildSettings(guildId);
      if (subcommand === "stop") {
        await context.voicePlayer.stop(guildId);
        await respond(interaction, "Stopped speaking and cleared the queue.");
        return;
      }
      const member = await fetchGuildMember(interaction);
      const preferences = await context.storage.getUserPreferences(interaction.user.id);
      const text = interaction.options.getString("text", true);
      const elevenLabsVoice = interaction.options.getString("voice_id") ?? preferences.voice;
      const googleVoice = interaction.options.getString("google_voice") ?? preferences.geminiVoice;
      const speed = clamp(interaction.options.getNumber("speed") ?? preferences.ttsSpeed, 0.7, 1.2);

      if (subcommand === "say" && !context.ai.isTtsAvailable()) {
        await respond(interaction, "TTS is currently unavailable. Re-checking service status...", { defer: true });
        const recoveryStatus = await context.ai.tryRecoverElevenLabsTts(true);
        if (!context.ai.isTtsAvailable()) {
          const reason = context.ai.getTtsUnavailableReason();
          throw new Error(`TTS is still unavailable. ${recoveryStatus}${reason ? ` ${reason}` : ""}`);
        }
        await respond(interaction, "TTS recovered. Generating speech...");
      } else {
        await respond(interaction, "Generating speech...", { defer: true });
      }

      const filePath = await context.ai.synthesizeSpeech({
        text,
        elevenLabsVoice,
        geminiVoice: googleVoice,
        language: guildSettings.ttsLanguage,
        speed,
        userId: interaction.user.id
      });
      const queueDepth = await context.voicePlayer.enqueue(member, filePath, speed);
      const queueMessage = queueDepth > 1 ? `Queued. There are **${queueDepth - 1}** item(s) ahead of this one.` : "Playing now.";
      await respond(interaction, `${queueMessage}\nElevenLabs voice: **${elevenLabsVoice || "default"}**\nGoogle voice: **${googleVoice || "auto"}**\nLanguage: **${guildSettings.ttsLanguage}**\nSpeed: **${speed}x**.`);
    }
  };

  const admin: BotCommand = {
    data: new SlashCommandBuilder().setName("admin").setDescription("Server-level controls for Nami.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) => subcommand.setName("feature").setDescription("Enable or disable bot features.")
        .addStringOption((option) => option.setName("name").setDescription("Feature name").setRequired(true).addChoices(...featureChoices))
        .addBooleanOption((option) => option.setName("enabled").setDescription("Turn the feature on or off").setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName("system-prompt").setDescription("Set the server-wide AI system prompt.")
        .addStringOption((option) => option.setName("prompt").setDescription("The bot-wide system instructions").setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName("announce").setDescription("Send a bot announcement to a text channel.")
        .addStringOption((option) => option.setName("message").setDescription("Announcement text").setRequired(true))
        .addChannelOption((option) => option.setName("channel").setDescription("Channel to post in").addChannelTypes(ChannelType.GuildText).setRequired(false)))
      .addSubcommand((subcommand) => subcommand.setName("clear-history").setDescription("Clear saved AI chat history.")
        .addUserOption((option) => option.setName("user").setDescription("Optional: clear one user's history only").setRequired(false)))
      .addSubcommand((subcommand) => subcommand.setName("set-announcements").setDescription("Save the default announcement channel.")
        .addChannelOption((option) => option.setName("channel").setDescription("Default announcement channel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName("tts-language").setDescription("Set server language for TTS and auto-read.")
        .addStringOption((option) => option.setName("value").setDescription("Example: Hindi, English").setRequired(true))),
    async execute(interaction, context) {
      const guildId = requireGuildId(interaction);
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "feature") {
        const name = interaction.options.getString("name", true) as FeatureFlag;
        const enabled = interaction.options.getBoolean("enabled", true);
        await context.storage.updateGuildSettings(guildId, (current) => {
          current.features[name] = enabled;
          return current;
        });
        await respond(interaction, `Feature **${name}** is now **${enabled ? "enabled" : "disabled"}**.`); return;
      }
      if (subcommand === "system-prompt") {
        const prompt = interaction.options.getString("prompt", true);
        await context.storage.updateGuildSettings(guildId, (current) => {
          current.systemPrompt = prompt;
          return current;
        });
        await respond(interaction, "Updated the server-wide AI system prompt."); return;
      }

      if (subcommand === "set-announcements") {
        const channel = interaction.options.getChannel("channel", true);
        await context.storage.updateGuildSettings(guildId, (current) => {
          current.announcementChannelId = channel.id;
          return current;
        });
        await respond(interaction, `Default announcements will go to <#${channel.id}>.`); return;
      }
      if (subcommand === "tts-language") {
        const value = interaction.options.getString("value", true).trim();
        await context.storage.updateGuildSettings(guildId, (current) => {
          current.ttsLanguage = value;
          return current;
        });
        await respond(interaction, `Server TTS language set to **${value}** for /tts say and auto-read.`);
        return;
      }
      if (subcommand === "announce") {
        const configured = (await context.storage.getGuildSettings(guildId)).announcementChannelId;
        const selectedChannel = interaction.options.getChannel("channel") ?? (configured ? await interaction.guild?.channels.fetch(configured) : null) ?? interaction.channel;
        if (!selectedChannel || !("send" in selectedChannel)) throw new Error("Pick a text channel for announcements.");
        await selectedChannel.send({ content: interaction.options.getString("message", true), allowedMentions: { parse: [] } });
        await respond(interaction, `Announcement sent to <#${selectedChannel.id}>.`); return;
      }
      const targetUser = interaction.options.getUser("user");
      const cleared = await context.storage.clearConversation(guildId, targetUser?.id);
      await respond(interaction, targetUser ? `Cleared ${cleared} saved conversation thread(s) for ${targetUser}.` : `Cleared **${cleared}** saved conversation thread(s) in this server.`);
    }
  };

  const help: BotCommand = {
    data: new SlashCommandBuilder().setName("help").setDescription("Show Nami's command guide."),
    async execute(interaction) {
      await respond(interaction, [
        "**Nami command guide**",
        "`/ask prompt:<text> web:<true|false>` - AI answers, optionally with web search",
        "`/preferences model mode:<smart|uncensored>` - switch AI mode (smart=OpenRouter, uncensored=Venice)",
        "`@Nami <message>` - chat naturally by mentioning the bot in a server",
        "`/search query:<text>` - web search summary with source links",
        "`/preferences ...` - your voice IDs, speed, model mode, language, and default search",
        "`/voice language value:<language>` - set server TTS/auto-read language (Manage Server required)",
        "`/memory view`, `/memory clear` - see or clear remembered conversation",
        "`/voice auto-read`, `/voice autojoin` - automatic VC speech behavior",
        "`/tts voices` - list provider voices plus Google/Gemini voice names",
        "`/game guess-start`, `/game guess-pick`, `/game trivia`, `/game scramble`, `/game rps`, `/game coinflip`",
        "`/voice join`, `/voice leave`, `/tts say`, `/tts stop` - voice chat controls",
        "`/admin ...` - feature flags, prompts, announcements, TTS language, and history cleanup"
      ].join("\n"), { ephemeral: true });
    }
  };

  return [ask, search, preferences, memory, game, voice, tts, admin, help];
}
