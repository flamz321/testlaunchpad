import { GeneralChat } from "@chaingpt/generalchat";

export interface AIChunk {
  type: "text" | "done" | "error";
  content?: string;
}

const COMPANY_NAME = "Feather App";
const COMPANY_DESCRIPTION =
  "Feather App is a crypto-native platform for launching and trading memecoins on Robinhood Chain (EVM). " +
  "It offers a Telegram & Discord bot, a Uniswap-oriented launchpad, " +
  "paid DEX listings, and a full social community layer with tiers, DMs, VIP, bounties, " +
  "leaderboards, profiles, and a social feed. The native token is $FEATHER on Robinhood Chain. " +
  "Users need 250,000+ $FEATHER to access Feather AI.";
const COMPANY_WEBSITE = "https://feather.app";

const PERSONA =
  "You are Feather, the official AI assistant for Feather App. " +
  "You are enthusiastic, knowledgeable, and crypto-native. " +
  "You specialize in Robinhood Chain memecoins, token launches, DeFi, Web3 wallets, and community building. " +
  "Keep answers concise and actionable. Never give financial advice. Always remind users to DYOR.";

function buildQuestion(
  userMessage: string,
  history: { role: string; content: string }[]
): string {
  const recent = history.slice(-10);
  if (recent.length === 0) return userMessage;

  let q = "Conversation history:\n";
  for (const m of recent) {
    const label = m.role === "assistant" ? "Feather" : "User";
    q += `${label}: ${m.content}\n`;
  }
  q += `\nUser: ${userMessage}`;
  return q;
}

export function streamFromChainGPT(
  userMessage: string,
  history: { role: string; content: string }[],
  onChunk: (chunk: AIChunk) => void,
  onClose: () => void,
  onError: (err: Error) => void
): () => void {
  const apiKey = process.env.CHAINGPT_API_KEY || process.env.CHAIN_GPT_KEY;
  if (!apiKey) {
    console.error("[ChainGPT] CHAIN_GPT_KEY is not set");
    setTimeout(() => {
      onChunk({ type: "error", content: "Feather AI is not configured yet. Please contact the admin." });
      onClose();
    }, 0);
    return () => {};
  }

  let aborted = false;
  let streamRef: any = null;

  const run = async () => {
    try {
      const client = new GeneralChat({ apiKey });
      const question = buildQuestion(userMessage, history);

      console.log("[ChainGPT] Starting stream | history:", history.length, "msgs | question:", userMessage.slice(0, 60));

      const stream = await client.createChatStream({
        question,
        chatHistory: "off",
        useCustomContext: true,
        contextInjection: {
          companyName: COMPANY_NAME,
          companyDescription: COMPANY_DESCRIPTION,
          companyWebsiteUrl: COMPANY_WEBSITE,
          assistantPersonality: PERSONA,
        },
      } as any);

      streamRef = stream;

      if (aborted) {
        stream.destroy?.();
        onClose();
        return;
      }

      stream.on("data", (chunk: Buffer | string) => {
        if (aborted) return;
        const text = chunk.toString();
        if (text) onChunk({ type: "text", content: text });
      });

      stream.on("end", () => {
        if (aborted) return;
        console.log("[ChainGPT] Stream complete");
        onClose();
      });

      stream.on("error", (err: Error) => {
        if (aborted) return;
        console.error("[ChainGPT] Stream error:", err.message);
        onError(err);
        onClose();
      });
    } catch (err: any) {
      if (aborted) return;
      console.error("[ChainGPT] Request error:", err.message ?? err);

      // Parse error details if available
      const status = err?.response?.status ?? err?.status;
      const body = err?.response?.data ?? err?.data ?? {};
      const msg = body?.message ?? err.message ?? "Unknown error";

      console.error("[ChainGPT] Status:", status, "| Message:", msg);

      if (status === 429) {
        onChunk({ type: "error", content: "Feather AI is busy right now. Please wait a moment and try again." });
      } else if (status === 401 || status === 403) {
        onChunk({ type: "error", content: "Feather AI authentication error. Please contact the admin." });
      } else {
        onChunk({ type: "error", content: "Feather AI encountered an error. Please try again." });
      }
      onClose();
    }
  };

  run();

  return () => {
    aborted = true;
    try { streamRef?.destroy?.(); } catch {}
  };
}
