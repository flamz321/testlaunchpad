/**
 * Legacy Pump.fun / Solana launch helpers — discontinued.
 * Feather App launches tokens on Robinhood Chain (EVM).
 * Exports kept for telegram/discord/routes import compatibility.
 */
import { isEvmAddress } from "@shared/chain";

const DISCONTINUED =
  "Pump.fun launches are no longer supported. Feather App launches tokens on Robinhood Chain.";

/** @deprecated Solana connection removed */
export const connection = {
  getParsedTokenAccountsByOwner: async () => {
    throw new Error(DISCONTINUED);
  },
  getLatestBlockhash: async () => {
    throw new Error(DISCONTINUED);
  },
  getAccountInfo: async () => {
    throw new Error(DISCONTINUED);
  },
  sendRawTransaction: async () => {
    throw new Error(DISCONTINUED);
  },
  confirmTransaction: async () => {
    throw new Error(DISCONTINUED);
  },
};

export function getBotKeypair(): never {
  throw new Error(
    "Solana bot wallet is no longer used. Feather App runs on Robinhood Chain (EVM)."
  );
}

/**
 * Minimal IPFS metadata upload via Pinata (no Solana).
 * Falls back to a clear error if Pinata is not configured.
 */
export async function uploadMetadataToIPFS(
  name: string,
  symbol: string,
  imageBuffer: Buffer,
  options: {
    isCashbackCoin?: boolean;
    mimeType?: string;
    description?: string;
    website?: string;
    twitter?: string;
  } = {}
): Promise<{ metadataUri: string; imageUrl: string | null }> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      `${DISCONTINUED} IPFS upload requires PINATA_JWT — or use the Feather App launchpad on the website.`
    );
  }

  const { mimeType = "image/png", description, website, twitter } = options;

  // Upload image
  const imgForm = new FormData();
  const blob = new Blob([imageBuffer], { type: mimeType });
  imgForm.append("file", blob, `${symbol.toLowerCase()}.png`);
  const imgRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: imgForm,
  });
  if (!imgRes.ok) {
    throw new Error(`Failed to upload image to IPFS (${imgRes.status})`);
  }
  const imgData = (await imgRes.json()) as { IpfsHash?: string };
  if (!imgData.IpfsHash) throw new Error("IPFS image upload returned no CID");
  const imageUrl = `https://gateway.pinata.cloud/ipfs/${imgData.IpfsHash}`;

  const metadata = {
    name,
    symbol,
    description: description || `${name} (${symbol}) — Launched via Feather App`,
    image: imageUrl,
    external_url: website || "",
    extensions: { twitter: twitter || "" },
  };

  const metaRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `${symbol}-metadata` },
    }),
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to upload metadata to IPFS (${metaRes.status})`);
  }
  const metaData = (await metaRes.json()) as { IpfsHash?: string };
  if (!metaData.IpfsHash) throw new Error("IPFS metadata upload returned no CID");

  return {
    metadataUri: `https://gateway.pinata.cloud/ipfs/${metaData.IpfsHash}`,
    imageUrl,
  };
}

export async function createPumpFunToken(
  _name: string,
  _symbol: string,
  _metadataUri: string,
  _botKeypair?: unknown,
  _options?: { isCashbackCoin?: boolean }
): Promise<{ txSignature: string; mintAddress: string }> {
  throw new Error(DISCONTINUED);
}

export type FeeRecipient =
  | { type: "wallet"; address: string }
  | { type: "github"; username: string };

export function parseFeeRecipient(input: string): FeeRecipient | null {
  const trimmed = input.trim();
  const githubMatch = trimmed.match(/^github:(.+)$/i);
  if (githubMatch) {
    const username = githubMatch[1].replace(/^@/, "").trim();
    if (username) return { type: "github", username };
    return null;
  }
  if (isEvmAddress(trimmed)) return { type: "wallet", address: trimmed };
  return null;
}

export async function setupCreatorFeeSharing(
  _mintAddress: string,
  _recipient: FeeRecipient,
  _botKeypair?: unknown
): Promise<string> {
  throw new Error(DISCONTINUED);
}

export interface ClaimResult {
  claimed: string[];
  noFees: string[];
  noConfig: string[];
  failed: string[];
}

export async function claimCreatorFees(
  _launches: Array<{ mintAddress: string; coinName: string }>,
  _botKeypair?: unknown
): Promise<ClaimResult> {
  throw new Error(
    "Creator fee claims via Pump.fun are no longer supported. Feather App launches tokens on Robinhood Chain."
  );
}
