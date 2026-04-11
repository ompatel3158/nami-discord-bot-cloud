import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember
} from "discord.js";
import { DEFAULT_USER_PREFERENCES, type AppConfig } from "./config.js";
import { GameService } from "./services/game-service.js";
import { AiService } from "./services/ai-service.js";
import { VoiceService } from "./services/voice-service.js";
import { AppStorage } from "./storage.js";
import type { FeatureFlag } from "./types.js";
import { clamp, formatCitationBlock, respond, requireGuildId } from "./utils.js";

export interface CommandContext {
  config: AppConfig;
  storage: AppStorage;
  games: GameService;
  ai: AiService | null;
  voice: VoiceService | null;
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

function requireFeature(
  interaction: ChatInputCommandInteraction,
  storage: AppStorage,
  feature: FeatureFlag
): void {
  const guildId = requireGuildId(interaction);
  if (!storage.getGuildSettings(guildId).features[feature]) {
    throw new Error(`The ${feature.toUpperCase()} feature is disabled in this server.`);
  }
}

async function fetchGuildMember(interaction: ChatInputCommandInteraction): Promise<GuildMember> {
  requireGuildId(interaction);
  if (!interaction.guild) {
    throw new Error("This command needs to be used inside a server.");
  }
  return interaction.guild.members.fetch(interaction.user.id);
}

export function createCommands(): BotCommand[] {
  const ask: BotCommand = {
    data: new SlashCommandBuilder()
      .setName("ask")
      .setDescription("Ask Nami an AI question.")
      .addStringOption((option) => option.setName("prompt").setDescription("What do you want to ask?").setRequired(true))
      .addBooleanOption((option) => option.setName("web").setDescription("Let Nami browse the web before answering.")),
    async execute(interaction, context) {
      requireFeature(interaction, context.storage, "ai");
      if (!context.ai) {
        throw new Error("OPENROUTER_API_KEY is missing, so AI replies are not available yet.");
      }
      const guildId = requireGuildId(interaction);
      const settings = context.storage.getGuildSettings(guildId);
      const preferences = context.storage.getUserPreferences(interaction.user.id);
      const prompt = interaction.options.getString("prompt", true);
      const searchWeb = interaction.options.getBoolean("web") ?? preferences.searchEnabledByDefault;
      if (searchWeb) {
        requireFeature(interaction, context.storage, "search");
      }
      await respond(interaction, "Thinking...", { defer: true });
      const history = context.storage.getConversation(guildId, interaction.user.id);
      const result = await context.ai.answerQuestion({
        prompt,
        history,
        searchWeb,
        systemPrompt: settings.systemPrompt,
        preferences,
        userId: interaction.user.id
      });
      context.storage.appendConversation(guildId, interaction.user.id, {
        role: "user",
        content: prompt,
        createdAt: new Date().toISOString()
      });
      context.storage.appendConversation(guildId, interaction.user.id, {
        role: "assistant",
        content: result.text,
        createdAt: new Date().toISOString()
      });
      await respond(interaction, `${result.text}${formatCitationBlock(result.citations)}`);
    }
  };

  const search: BotCommand = {
    data: new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search the web and summarize the results.")
      .addStringOption((option) => option.setName("query").setDescription("What should Nami search for?").setRequired(true)),
    async execute(interaction, context) {
      requireFeature(interaction, context.storage, "search");
      if (!context.ai) {
        throw new Error("OPENROUTER_API_KEY is missing, so web search is not available yet.");
      }
      const query = interaction.options.getString("query", true);
      const preferences = context.storage.getUserPreferences(interaction.user.id);
      await respond(interaction, "Searching the web...", { defer: true });
      const result = await context.ai.searchWeb(query, preferences, interaction.user.id);
      await respond(interaction, `${result.text}${formatCitationBlock(result.citations)}`);
    }
  };

  const preferences: BotCommand = {
    data: new SlashCommandBuilder()
      .setName("preferences")
      .setDescription("Set your Nami preferences.")
      .addSubcommand((subcommand) => subcommand.setName("view").setDescription("Show your current settings."))
      .addSubcommand((subcommand) =>
        subcommand
          .setName("voice")
          .setDescription("Set your preferred ElevenLabs voice ID and TTS tuning.")
          .addStringOption((option) => option.setName("voice_id").setDescription("Voice ID from ElevenLabs or 'default'").setRequired(true))
          .addNumberOption((option) => option.setName("speed").setDescription("Playback speed from 0.25 to 4.0"))
          .addStringOption((option) => option.setName("instructions").setDescription("Saved speech notes for your own reference"))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("ai-style")
          .setDescription("Set how Nami answers you.")
          .addStringOption((option) => option.setName("style").setDescription("Friendly, concise, detailed, playful, etc.").setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("search")
          .setDescription("Choose whether /ask should use web search by default.")
          .addBooleanOption((option) => option.setName("enabled").setDescription("Enable web search by default for your /ask command").setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("language")
          .setDescription("Set your preferred reply language.")
          .addStringOption((option) => option.setName("value").setDescription("Example: English, Hindi").setRequired(true))
      )
      .addSubcommand((subcommand) => subcommand.setName("reset").setDescription("Reset all your preferences.")),
    async execute(interaction, context) {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "view") {
        const current = context.storage.getUserPreferences(interaction.user.id);
        await respond(
          interaction,
          [
            "Your preferences:",
            `Voice ID: **${current.voice}**`,
            `TTS speed: **${current.ttsSpeed}x**`,
            `Speech notes: ${current.ttsInstructions}`,
            `AI style: ${current.aiStyle}`,
            `Default web search: **${current.searchEnabledByDefault ? "on" : "off"}**`,
            `Language: **${current.language}**`
          ].join("\n"),
          { ephemeral: true }
        );
        return;
      }
      if (subcommand === "reset") {
        context.storage.saveUserPreferences(interaction.user.id, DEFAULT_USER_PREFERENCES);
        await respond(interaction, "Your preferences have been reset to the defaults.", { ephemeral: true });
        return;
      }
      const updated = context.storage.updateUserPreferences(interaction.user.id, (current) => {
        if (subcommand === "voice") {
          current.voice = interaction.options.getString("voice_id", true);
          const speed = interaction.options.getNumber("speed");
          const instructions = interaction.options.getString("instructions");
          if (speed !== null) {
            current.ttsSpeed = clamp(speed, 0.25, 4);
          }
          if (instructions) {
            current.ttsInstructions = instructions;
          }
        }
        if (subcommand === "ai-style") {
          current.aiStyle = interaction.options.getString("style", true);
        }
        if (subcommand === "search") {
          current.searchEnabledByDefault = interaction.options.getBoolean("enabled", true);
        }
        if (subcommand === "language") {
          current.language = interaction.options.getString("value", true);
        }
        return current;
      });
      await respond(
        interaction,
        `Saved. Voice ID: **${updated.voice}**, style: ${updated.aiStyle}, language: **${updated.language}**.`,
        { ephemeral: true }
      );
    }
  };

  const game: BotCommand = {
    data: new SlashCommandBuilder()
      .setName("game")
      .setDescription("Play text-based mini games with Nami.")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("guess-start")
          .setDescription("Start a number guessing game.")
          .addIntegerOption((option) => option.setName("max").setDescription("Highest possible number").setMinValue(10).setMaxValue(500))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("guess-pick")
          .setDescription("Make a guess in the active number game.")
          .addIntegerOption((option) => option.setName("number").setDescription("Your guess").setRequired(true).setMinValue(1).setMaxValue(500))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("trivia")
          .setDescription("Start or answer a trivia round.")
          .addStringOption((option) => option.setName("answer").setDescription("A, B, C, D, or the full choice"))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("scramble")
          .setDescription("Start or answer a word scramble round.")
          .addStringOption((option) => option.setName("answer").setDescription("Your guess"))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("rps")
          .setDescription("Play rock paper scissors.")
          .addStringOption((option) =>
            option
              .setName("choice")
              .setDescription("Your move")
              .setRequired(true)
              .addChoices({ name: "Rock", value: "rock" }, { name: "Paper", value: "paper" }, { name: "Scissors", value: "scissors" })
          )
      )
      .addSubcommand((subcommand) => subcommand.setName("coinflip").setDescription("Flip a coin.")),
    async execute(interaction, context) {
      requireFeature(interaction, context.storage, "games");
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
        if (!answer) {
          await respond(interaction, context.games.formatTriviaPrompt(context.games.getOrCreateTrivia(key)));
          return;
        }
        await respond(interaction, context.games.answerTrivia(key, answer).message);
        return;
      }
      if (subcommand === "scramble") {
        const answer = interaction.options.getString("answer") ?? undefined;
        if (!answer) {
          const state = context.games.getOrCreateScramble(key);
          await respond(interaction, `Unscramble this word: **${state.scrambled}**\nReply with \`/game scramble answer:<word>\`.`);
          return;
        }
        await respond(interaction, context.games.answerScramble(key, answer).message);
        return;
      }
      if (subcommand === "rps") {
        await respond(interaction, context.games.playRockPaperScissors(interaction.options.getString("choice", true)));
        return;
      }
      await respond(interaction, `The coin landed on **${context.games.flipCoin()}**.`);
    }
  };

  const voice: BotCommand = {
    data: new SlashCommandBuilder()
      .setName("voice")
      .setDescription("Manage Nami in voice channels.")
      .addSubcommand((subcommand) => subcommand.setName("join").setDescription("Join your voice channel."))
      .addSubcommand((subcommand) => subcommand.setName("leave").setDescription("Leave the current voice channel.")),
    async execute(interaction, context) {
      requireFeature(interaction, context.storage, "tts");
      if (!context.voice) {
        throw new Error("Voice is unavailable because the speech service is not configured yet.");
      }
      const guildId = requireGuildId(interaction);
      if (interaction.options.getSubcommand() === "join") {
        await context.voice.ensureConnection(await fetchGuildMember(interaction));
        await respond(interaction, "Joined your voice channel.");
        return;
      }
      await context.voice.leave(guildId);
      await respond(interaction, "Left the voice channel and cleared the queue.");
    }
  };

  const tts: BotCommand = {
    data: new SlashCommandBuilder()
      .setName("tts")
      .setDescription("Speak text in voice chat using ElevenLabs voices.")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("say")
          .setDescription("Speak a message in your voice channel.")
          .addStringOption((option) => option.setName("text").setDescription("What should Nami say?").setRequired(true))
          .addStringOption((option) => option.setName("voice").setDescription("ElevenLabs voice ID or leave blank for your saved default"))
          .addNumberOption((option) => option.setName("speed").setDescription("Playback speed from 0.25 to 4.0"))
          .addStringOption((option) => option.setName("instructions").setDescription("Saved speech notes for your own reference"))
      )
      .addSubcommand((subcommand) => subcommand.setName("stop").setDescription("Stop speaking and clear the queue."))
      .addSubcommand((subcommand) => subcommand.setName("voices").setDescription("List the voices available on your ElevenLabs account.")),
    async execute(interaction, context) {
      requireFeature(interaction, context.storage, "tts");
      if (!context.ai || !context.voice) {
        throw new Error("ELEVENLABS_API_KEY is missing, so AI text-to-speech is not available yet.");
      }
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "voices") {
        const voices = await context.ai.listVoices();
        const list = voices
          .slice(0, 15)
          .map((voiceInfo) => `- **${voiceInfo.name}** (\`${voiceInfo.id}\`) [${voiceInfo.category}]`)
          .join("\n");
        await respond(interaction, `Available voices:\n${list || "No voices were returned by ElevenLabs."}`, { ephemeral: true });
        return;
      }
      const guildId = requireGuildId(interaction);
      if (subcommand === "stop") {
        await context.voice.stop(guildId);
        await respond(interaction, "Stopped speaking and cleared the queue.");
        return;
      }
      const member = await fetchGuildMember(interaction);
      const preferences = context.storage.getUserPreferences(interaction.user.id);
      const text = interaction.options.getString("text", true);
      const voiceId = interaction.options.getString("voice") ?? preferences.voice;
      const speed = clamp(interaction.options.getNumber("speed") ?? preferences.ttsSpeed, 0.25, 4);
      const instructions = interaction.options.getString("instructions") ?? preferences.ttsInstructions;
      await respond(interaction, "Generating speech...", { defer: true });
      const filePath = await context.ai.synthesizeSpeech({
        text,
        elevenLabsVoice: voiceId,
        geminiVoice: preferences.geminiVoice,
        language: preferences.language,
        speed,
        userId: interaction.user.id
      });
      const queueDepth = await context.voice.enqueue(member, filePath, speed);
      const queueMessage = queueDepth > 1 ? `Queued. There are **${queueDepth - 1}** item(s) ahead of this one.` : "Playing now.";
      await respond(interaction, `${queueMessage}\nVoice ID: **${voiceId}** at **${speed}x**.\nSaved speech notes: ${instructions}\nThis uses an AI-generated voice.`);
    }
  };

  const admin: BotCommand = {
    data: new SlashCommandBuilder()
      .setName("admin")
      .setDescription("Server-level controls for Nami.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("feature")
          .setDescription("Enable or disable bot features.")
          .addStringOption((option) => option.setName("name").setDescription("Feature name").setRequired(true).addChoices(...featureChoices))
          .addBooleanOption((option) => option.setName("enabled").setDescription("Turn the feature on or off").setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("system-prompt")
          .setDescription("Set the server-wide AI system prompt.")
          .addStringOption((option) => option.setName("prompt").setDescription("The bot-wide system instructions").setRequired(true))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("announce")
          .setDescription("Send a bot announcement to a text channel.")
          .addStringOption((option) => option.setName("message").setDescription("Announcement text").setRequired(true))
          .addChannelOption((option) => option.setName("channel").setDescription("Channel to post in").addChannelTypes(ChannelType.GuildText))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("clear-history")
          .setDescription("Clear saved AI chat history.")
          .addUserOption((option) => option.setName("user").setDescription("Optional: clear one user's history only"))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set-announcements")
          .setDescription("Save the default announcement channel.")
          .addChannelOption((option) => option.setName("channel").setDescription("Default announcement channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
      ),
    async execute(interaction, context) {
      const guildId = requireGuildId(interaction);
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "feature") {
        const name = interaction.options.getString("name", true) as FeatureFlag;
        const enabled = interaction.options.getBoolean("enabled", true);
        context.storage.updateGuildSettings(guildId, (current) => {
          current.features[name] = enabled;
          return current;
        });
        await respond(interaction, `Feature **${name}** is now **${enabled ? "enabled" : "disabled"}**.`);
        return;
      }
      if (subcommand === "system-prompt") {
        const prompt = interaction.options.getString("prompt", true);
        context.storage.updateGuildSettings(guildId, (current) => {
          current.systemPrompt = prompt;
          return current;
        });
        await respond(interaction, "Updated the server-wide AI system prompt.");
        return;
      }
      if (subcommand === "set-announcements") {
        const channel = interaction.options.getChannel("channel", true);
        context.storage.updateGuildSettings(guildId, (current) => {
          current.announcementChannelId = channel.id;
          return current;
        });
        await respond(interaction, `Default announcements will go to <#${channel.id}>.`);
        return;
      }
      if (subcommand === "announce") {
        const configured = context.storage.getGuildSettings(guildId).announcementChannelId;
        const selectedChannel =
          interaction.options.getChannel("channel") ??
          (configured ? await interaction.guild?.channels.fetch(configured) : null) ??
          interaction.channel;
        if (!selectedChannel || !("send" in selectedChannel)) {
          throw new Error("Pick a text channel for announcements.");
        }
        await selectedChannel.send({
          content: interaction.options.getString("message", true),
          allowedMentions: { parse: [] }
        });
        await respond(interaction, `Announcement sent to <#${selectedChannel.id}>.`);
        return;
      }
      const targetUser = interaction.options.getUser("user");
      const cleared = context.storage.clearConversation(guildId, targetUser?.id);
      await respond(
        interaction,
        targetUser
          ? `Cleared ${cleared} saved conversation thread(s) for ${targetUser}.`
          : `Cleared **${cleared}** saved conversation thread(s) in this server.`
      );
    }
  };

  const help: BotCommand = {
    data: new SlashCommandBuilder().setName("help").setDescription("Show Nami's command guide."),
    async execute(interaction) {
      await respond(
        interaction,
        [
          "**Nami command guide**",
          "`/ask prompt:<text> web:<true|false>` - AI answers, optionally with web search",
          "`@Nami <message>` - chat naturally by mentioning the bot in a server",
          "`/search query:<text>` - web search summary with source links",
          "`/preferences ...` - your voice ID, speed, language, answer style, and default search",
          "`/tts voices` - list the ElevenLabs voice IDs available to your API key",
          "`/game guess-start`, `/game guess-pick`, `/game trivia`, `/game scramble`, `/game rps`, `/game coinflip`",
          "`/voice join`, `/voice leave`, `/tts say`, `/tts stop` - voice chat controls",
          "`/admin ...` - feature flags, prompts, announcements, and history cleanup"
        ].join("\n"),
        { ephemeral: true }
      );
    }
  };

  return [ask, search, preferences, game, voice, tts, admin, help];
}
