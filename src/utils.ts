import { MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import type { Citation } from "./types.js";

const DISCORD_LIMIT = 1900;

export function splitMessage(text: string, limit = DISCORD_LIMIT): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    let slicePoint = remaining.lastIndexOf("\n", limit);
    if (slicePoint < Math.floor(limit / 2)) {
      slicePoint = remaining.lastIndexOf(" ", limit);
    }
    if (slicePoint < Math.floor(limit / 2)) {
      slicePoint = limit;
    }

    chunks.push(remaining.slice(0, slicePoint).trim());
    remaining = remaining.slice(slicePoint).trim();
  }

  if (remaining.trim().length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const results: Citation[] = [];

  for (const citation of citations) {
    if (seen.has(citation.url)) {
      continue;
    }

    seen.add(citation.url);
    results.push(citation);
  }

  return results;
}

export function formatCitationBlock(citations: Citation[]): string {
  const unique = uniqueCitations(citations).slice(0, 5);
  if (unique.length === 0) {
    return "";
  }

  const lines = unique.map((citation, index) => `${index + 1}. [${citation.title}](${citation.url})`);
  return `\n\nSources:\n${lines.join("\n")}`;
}

export async function respond(
  interaction: ChatInputCommandInteraction,
  content: string,
  options: { ephemeral?: boolean; defer?: boolean } = {}
): Promise<void> {
  const chunks = splitMessage(content);
  const flags = options.ephemeral ? MessageFlags.Ephemeral : undefined;

  const isInteractionResponseError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.message.includes("Unknown interaction") || error.message.includes("Interaction has already been acknowledged");
  };

  if (options.defer && !interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferReply(flags ? { flags } : undefined);
    } catch (error) {
      if (isInteractionResponseError(error)) {
        return;
      }
      throw error;
    }
  }

  if (!interaction.deferred && !interaction.replied) {
    const reply: InteractionReplyOptions = { content: chunks[0] };
    if (flags) {
      reply.flags = flags;
    }
    try {
      await interaction.reply(reply);
    } catch (error) {
      if (isInteractionResponseError(error)) {
        return;
      }
      throw error;
    }
  } else {
    try {
      await interaction.editReply({ content: chunks[0] });
    } catch (error) {
      if (isInteractionResponseError(error)) {
        return;
      }
      throw error;
    }
  }

  for (const chunk of chunks.slice(1)) {
    const followUp: InteractionReplyOptions = { content: chunk };
    if (flags) {
      followUp.flags = flags;
    }
    try {
      await interaction.followUp(followUp);
    } catch (error) {
      if (isInteractionResponseError(error)) {
        return;
      }
      throw error;
    }
  }
}

export function requireGuildId(interaction: ChatInputCommandInteraction): string {
  if (!interaction.guildId) {
    throw new Error("This command can only be used inside a server.");
  }

  return interaction.guildId;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function escapeMarkdownLinkLabel(input: string): string {
  return input.replace(/\[/g, "(").replace(/\]/g, ")");
}
