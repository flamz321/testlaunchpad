import WebSocket from "ws";

const MOLT_WS_URL =
  process.env.MOLT_WS_URL ||
  "wss://multiclaw.moltid.workers.dev/c/molt_8ee286410bea543f8fe5454b";

export interface MoltChunk {
  type: "thinking" | "tool" | "text" | "done" | "error";
  content?: string;
  toolName?: string;
}

function parseChunk(raw: string): MoltChunk | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    // Skip protocol events — these are not content chunks
    if (obj.type === "event") return null;
    if (obj.type === "done" || obj.type === "end" || obj.done === true) {
      return { type: "done" };
    }
    if (obj.type === "error" || obj.error) {
      return { type: "error", content: obj.error ?? obj.message ?? obj.content ?? "Agent error" };
    }
    if (obj.type === "thinking" || obj.type === "thought") {
      return { type: "thinking", content: obj.content ?? obj.text ?? "" };
    }
    if (obj.type === "tool_call" || obj.type === "tool") {
      return { type: "tool", toolName: obj.name ?? obj.tool ?? "tool", content: obj.content ?? "" };
    }
    if (obj.type === "text" || obj.type === "message") {
      return { type: "text", content: obj.content ?? obj.text ?? trimmed };
    }
    if (obj.content || obj.text) {
      return { type: "text", content: obj.content ?? obj.text };
    }
    return null;
  } catch {
    if (!trimmed || trimmed.startsWith("{")) return null;
    return { type: "text", content: trimmed };
  }
}

export function streamFromMolt(
  userMessage: string,
  history: { role: string; content: string }[],
  onChunk: (chunk: MoltChunk) => void,
  onClose: () => void,
  onError: (err: Error) => void
): () => void {
  const token = process.env.MOLT_GATEWAY_TOKEN;
  if (!token) {
    console.error("[MoltAI] MOLT_GATEWAY_TOKEN is not set");
    setTimeout(() => {
      onChunk({ type: "error", content: "Feather AI is not configured yet." });
      onClose();
    }, 0);
    return () => {};
  }

  const cleanToken = token.trim();
  console.log("[MoltAI] Connecting to:", MOLT_WS_URL, "| token length:", cleanToken.length);

  let ws: WebSocket;
  try {
    ws = new WebSocket(MOLT_WS_URL, {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "User-Agent": "FeatherApp/1.0",
        Origin: "https://feather.app",
      },
      perMessageDeflate: false,  // Disable compression — some servers reject deflate frames
    });
  } catch (e) {
    console.error("[MoltAI] Failed to construct WebSocket:", e);
    setTimeout(() => { onError(e as Error); onClose(); }, 0);
    return () => {};
  }

  // 45-second hard timeout
  const timeout = setTimeout(() => {
    console.error("[MoltAI] Timed out after 45s");
    onChunk({ type: "error", content: "Connection timed out. Please try again." });
    try { ws.terminate(); } catch {}
    onClose();
  }, 45_000);

  let authenticated = false;

  ws.on("open", () => {
    console.log("[MoltAI] WebSocket open — waiting for challenge");
  });

  ws.on("message", (data: WebSocket.RawData) => {
    const raw = data.toString();
    console.log("[MoltAI] Message:", raw.slice(0, 400));

    // Handle challenge-response handshake
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {}

    // connect.challenge = auth handshake complete via Bearer header
    // Send user message immediately — no challenge response needed
    if (parsed?.type === "event" && parsed?.event === "connect.challenge") {
      const nonce = parsed?.payload?.nonce;
      console.log("[MoltAI] Got challenge nonce:", nonce, "— sending user message now (perMessageDeflate: false)");
      clearTimeout(timeout);
      authenticated = true;
      const msgPayload = JSON.stringify({ role: "user", content: userMessage, history: history.slice(-12) });
      console.log("[MoltAI] Message payload:", msgPayload.slice(0, 120));
      ws.send(msgPayload);
      return;
    }

    // Any other message — already authenticated, just parse chunks
    if (!authenticated) {
      authenticated = true;
      clearTimeout(timeout);
    }

    // Parse content chunks
    const lines = raw.split("\n");
    for (const line of lines) {
      const chunk = parseChunk(line);
      if (chunk) onChunk(chunk);
    }
  });

  ws.on("close", (code, reason) => {
    clearTimeout(timeout);
    console.log("[MoltAI] Closed | code:", code, "| reason:", reason?.toString() || "(none)");
    onClose();
  });

  ws.on("error", (err) => {
    clearTimeout(timeout);
    console.error("[MoltAI] Error:", err.message);
    onError(err);
    onClose();
  });

  ws.on("unexpected-response", (req, res) => {
    clearTimeout(timeout);
    const location = (res.headers["location"] as string) ?? "(none)";
    let body = "";
    res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    res.on("end", () => {
      console.error("[MoltAI] Unexpected response | status:", res.statusCode, "| location:", location, "| body:", body.slice(0, 300));
      onError(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
      onClose();
    });
  });

  return () => {
    clearTimeout(timeout);
    try { ws.terminate(); } catch {}
  };
}
