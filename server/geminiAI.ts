export interface AIChunk {
  type: "text" | "done" | "error";
  content?: string;
}

const SYSTEM_PROMPT = `You are Feather, the official AI assistant for Feather App — a platform for launching and trading memecoins on Robinhood Chain (EVM).

You help users with:
- Launching tokens on Robinhood Chain via Uniswap / the Feather App launchpad
- Understanding tokenomics, liquidity, and DEX listings
- Navigating the Feather App community (social feed, leaderboards, bounties, VIP)
- Tips on marketing and growing a token community
- General Robinhood Chain and EVM ecosystem knowledge

You are enthusiastic, knowledgeable, and slightly edgy — fitting the memecoin culture. Keep answers concise and practical. Never give financial advice. Always remind users to DYOR (Do Your Own Research).

The native token is $FEATHER on Robinhood Chain. Users need 250,000+ $FEATHER to access you.`;

function toGeminiHistory(history: { role: string; content: string }[]) {
  return history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export function streamFromGemini(
  userMessage: string,
  history: { role: string; content: string }[],
  onChunk: (chunk: AIChunk) => void,
  onClose: () => void,
  onError: (err: Error) => void
): () => void {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[GeminiAI] GEMINI_API_KEY is not set");
    setTimeout(() => {
      onChunk({ type: "error", content: "Feather AI is not configured yet. Please contact the admin." });
      onClose();
    }, 0);
    return () => {};
  }

  const controller = new AbortController();

  const run = async () => {
    try {
      const model = "gemini-2.0-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

      const geminiHistory = toGeminiHistory(history);
      const contents = [
        ...geminiHistory,
        { role: "user", parts: [{ text: userMessage }] },
      ];

      console.log("[GeminiAI] Starting request | model:", model, "| history:", history.length, "msgs");

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.9,
            topP: 1,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("[GeminiAI] HTTP error:", res.status, errBody.slice(0, 300));
        if (res.status === 429) {
          onChunk({ type: "error", content: "Feather AI is busy right now — too many requests. Please wait a moment and try again." });
          onClose();
        } else if (res.status === 400) {
          onChunk({ type: "error", content: "Invalid request to Feather AI. Please try again." });
          onClose();
        } else {
          onError(new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 200)}`));
          onClose();
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError(new Error("No response body from Gemini"));
        onClose();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onChunk({ type: "text", content: text });
          } catch {
            // skip malformed lines
          }
        }
      }

      console.log("[GeminiAI] Stream complete");
      onClose();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.log("[GeminiAI] Aborted by client");
        onClose();
        return;
      }
      console.error("[GeminiAI] Stream error:", err.message);
      onError(err);
      onClose();
    }
  };

  run();
  return () => { controller.abort(); };
}
