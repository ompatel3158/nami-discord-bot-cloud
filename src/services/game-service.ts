import { randomInt } from "node:crypto";
import type { GuessGameState, ScrambleGameState, TriviaGameState } from "../types.js";

/** Games idle longer than this are considered stale and will be silently replaced. */
const GAME_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Cryptographically fair Fisher-Yates shuffle using crypto.randomInt. */
function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]] as [T, T];
  }
  return copy;
}

const TRIVIA_BANK: Array<Omit<TriviaGameState, "startedAt">> = [
  {
    prompt: "Which planet is known as the Red Planet?",
    choices: ["Mars", "Venus", "Jupiter", "Mercury"],
    answer: "Mars",
    explanation: "Mars appears red because of iron oxide dust on its surface."
  },
  {
    prompt: "What does HTML stand for?",
    choices: [
      "HyperText Markup Language",
      "HighText Markdown Language",
      "Hyper Transfer Machine Language",
      "Home Tool Markup Language"
    ],
    answer: "HyperText Markup Language",
    explanation: "HTML is the main markup language used to structure web pages."
  },
  {
    prompt: "Which ocean is the largest on Earth?",
    choices: ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean"],
    answer: "Pacific Ocean",
    explanation: "The Pacific Ocean covers more surface area than any other ocean."
  },
  {
    prompt: "Which language is built into web browsers?",
    choices: ["JavaScript", "Python", "Rust", "C#"],
    answer: "JavaScript",
    explanation: "JavaScript is the browser's native scripting language."
  },
  {
    prompt: "What year did Discord first launch?",
    choices: ["2015", "2013", "2018", "2020"],
    answer: "2015",
    explanation: "Discord launched publicly in 2015."
  }
];

const SCRAMBLE_WORDS = [
  "pirate",
  "lantern",
  "galaxy",
  "octopus",
  "rhythm",
  "javascript",
  "anchor",
  "treasure",
  "waveform",
  "captain"
];

interface GameMessage {
  message: string;
}

export class GameService {
  private readonly guessGames = new Map<string, GuessGameState>();
  private readonly triviaGames = new Map<string, TriviaGameState>();
  private readonly scrambleGames = new Map<string, ScrambleGameState>();

  startGuess(key: string, max: number): GuessGameState {
    const state: GuessGameState = {
      secret: randomInt(1, max + 1),
      max,
      attempts: 0,
      startedAt: new Date().toISOString()
    };

    this.guessGames.set(key, state);
    return state;
  }

  guess(key: string, value: number): GameMessage {
    const state = this.guessGames.get(key);
    if (!state) {
      return { message: "No active guess game yet. Start one with `/game guess-start`." };
    }

    state.attempts += 1;

    if (value === state.secret) {
      this.guessGames.delete(key);
      return {
        message: `You got it in ${state.attempts} attempt(s). The number was **${state.secret}**.`
      };
    }

    const hint = value < state.secret ? "Too low." : "Too high.";
    return {
      message: `${hint} Try again with \`/game guess-pick\`. Attempts: **${state.attempts}**.`
    };
  }

  getOrCreateTrivia(key: string): TriviaGameState {
    const current = this.triviaGames.get(key);
    if (current && Date.now() - new Date(current.startedAt).getTime() < GAME_TTL_MS) {
      return current;
    }

    const template = TRIVIA_BANK[randomInt(0, TRIVIA_BANK.length)];
    const next: TriviaGameState = {
      ...template,
      startedAt: new Date().toISOString()
    };

    this.triviaGames.set(key, next);
    return next;
  }

  answerTrivia(key: string, answer?: string): GameMessage {
    const state = this.triviaGames.get(key);
    if (!state) {
      return { message: "No active trivia round yet. Start one with `/game trivia`." };
    }

    if (!answer) {
      return { message: this.formatTriviaPrompt(state) };
    }

    const normalized = answer.trim().toLowerCase();
    const answerIndex = state.choices.findIndex((choice) => choice === state.answer);
    const expectedLetter = ["a", "b", "c", "d"][answerIndex];
    const matchedChoice = state.choices.find((choice) => choice.toLowerCase() === normalized);

    if (normalized === expectedLetter || matchedChoice === state.answer) {
      this.triviaGames.delete(key);
      return {
        message: `Correct. **${state.answer}** is right.\n${state.explanation}`
      };
    }

    return {
      message: `Not quite. Try again.\n\n${this.formatTriviaPrompt(state)}`
    };
  }

  getOrCreateScramble(key: string): ScrambleGameState {
    const current = this.scrambleGames.get(key);
    if (current && Date.now() - new Date(current.startedAt).getTime() < GAME_TTL_MS) {
      return current;
    }

    const answer = SCRAMBLE_WORDS[randomInt(0, SCRAMBLE_WORDS.length)];
    // Use cryptographically fair Fisher-Yates shuffle instead of biased Math.random sort.
    const scrambled = shuffleArray(answer.split("")).join("");

    const state: ScrambleGameState = {
      scrambled,
      answer,
      startedAt: new Date().toISOString()
    };

    this.scrambleGames.set(key, state);
    return state;
  }

  answerScramble(key: string, answer?: string): GameMessage {
    const state = this.scrambleGames.get(key);
    if (!state) {
      return { message: "No active scramble round yet. Start one with `/game scramble`." };
    }

    if (!answer) {
      return { message: `Unscramble this word: **${state.scrambled}**` };
    }

    if (answer.trim().toLowerCase() === state.answer.toLowerCase()) {
      this.scrambleGames.delete(key);
      return { message: `Nice one. The answer was **${state.answer}**.` };
    }

    return {
      message: `Nope, try again.\nUnscramble this word: **${state.scrambled}**`
    };
  }

  playRockPaperScissors(choice: string): string {
    const options = ["rock", "paper", "scissors"] as const;
    const botChoice = options[randomInt(0, options.length)];
    const normalized = choice.toLowerCase();

    if (normalized === botChoice) {
      return `I picked **${botChoice}** too. It's a tie.`;
    }

    const userWins =
      (normalized === "rock" && botChoice === "scissors") ||
      (normalized === "paper" && botChoice === "rock") ||
      (normalized === "scissors" && botChoice === "paper");

    return userWins
      ? `I picked **${botChoice}**. You win this round.`
      : `I picked **${botChoice}**. I win this round.`;
  }

  flipCoin(): string {
    return randomInt(0, 2) === 0 ? "heads" : "tails";
  }

  formatTriviaPrompt(state: TriviaGameState): string {
    const labels = ["A", "B", "C", "D"];
    const choices = state.choices
      .map((choice, index) => `${labels[index]}. ${choice}`)
      .join("\n");

    return `Trivia time:\n**${state.prompt}**\n${choices}\n\nAnswer with \`/game trivia answer:<choice>\` using the letter or the full choice.`;
  }
}
