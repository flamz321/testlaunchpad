/**
 * Robinhood Chain token launch helpers.
 * Metadata is uploaded to IPFS; the actual factory.create tx is signed by the user's wallet.
 */
import {
  createPublicClient,
  http,
  type Address,
} from "viem";
import {
  DEFAULT_RPC_URL,
  ROBINHOOD_CHAIN,
  ROBINHOOD_LAUNCHPAD,
  isEvmAddress,
} from "@shared/chain";
import { bagsFactoryAbi, type ClaimerAllocation, validateClaimers } from "@shared/bags";
import crypto from "crypto";
import path from "path";
import fs from "fs";

export type BagsFeeRecipient =
  | { type: "wallet"; address: string }
  | { type: "github" | "twitter" | "kick"; username: string }
  | null;

export interface FeeRecipientEntry {
  wallet: string;
  basisPoints: number;
}

const publicClient = createPublicClient({
  chain: {
    id: ROBINHOOD_CHAIN.id,
    name: ROBINHOOD_CHAIN.name,
    nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
    rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
  },
  transport: http(DEFAULT_RPC_URL, { batch: true }),
});

async function pinFile(buffer: Buffer, filename: string, mimeType: string): Promise<{ cid: string; url: string }> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
    const fname = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
    const dir = path.join(process.cwd(), "uploads", "launch");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fname), buffer);
    const appUrl = (process.env.APP_URL || "https://featherapp.fun").replace(/\/$/, "");
    return { cid: fname, url: `${appUrl}/uploads/launch/${fname}` };
  }
  const { default: FormData } = await import("form-data");
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mimeType });
  form.append("pinataMetadata", JSON.stringify({ name: filename }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, ...form.getHeaders() },
    body: form.getBuffer(),
  });
  if (!response.ok) throw new Error(`IPFS image upload failed: ${await response.text()}`);
  const json: any = await response.json();
  const cid = json.IpfsHash as string;
  return { cid, url: `https://gateway.pinata.cloud/ipfs/${cid}` };
}

async function pinJson(metadata: object, name: string): Promise<{ cid: string; url: string; uri: string }> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    const fname = `${crypto.randomBytes(16).toString("hex")}.json`;
    const dir = path.join(process.cwd(), "uploads", "metadata");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fname), JSON.stringify(metadata, null, 2));
    const appUrl = (process.env.APP_URL || "https://featherapp.fun").replace(/\/$/, "");
    const url = `${appUrl}/uploads/metadata/${fname}`;
    return { cid: fname, url, uri: url };
  }
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name },
    }),
  });
  if (!response.ok) throw new Error(`IPFS metadata upload failed: ${await response.text()}`);
  const json: any = await response.json();
  const cid = json.IpfsHash as string;
  return {
    cid,
    url: `https://gateway.pinata.cloud/ipfs/${cid}`,
    uri: `ipfs://${cid}`,
  };
}

export async function getCreationFeeWei(): Promise<bigint> {
  return publicClient.readContract({
    address: ROBINHOOD_LAUNCHPAD.factory as Address,
    abi: bagsFactoryAbi,
    functionName: "creationFee",
  }) as Promise<bigint>;
}

export async function prepareLaunchMetadata(params: {
  name: string;
  symbol: string;
  imageBuffer: Buffer;
  mimeType?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  onStatus?: (msg: string) => void;
}): Promise<{ metadataURI: string; imageUrl: string; creationFeeWei: string }> {
  const {
    name,
    symbol,
    imageBuffer,
    mimeType = "image/png",
    description,
    website,
    twitter,
    telegram,
    onStatus,
  } = params;

  onStatus?.("Uploading token image…");
  const image = await pinFile(imageBuffer, `${symbol.toLowerCase()}-logo`, mimeType);

  onStatus?.("Uploading token metadata…");
  const metadata: Record<string, unknown> = {
    name,
    symbol,
    description: description || `${name} (${symbol}) — Launched on Feather App`,
    image: image.url,
  };
  if (website) metadata.website = website;
  if (twitter) {
    metadata.twitter = twitter;
    metadata.extensions = { ...(metadata.extensions as object || {}), twitter };
  }
  if (telegram) {
    metadata.telegram = telegram;
    metadata.extensions = { ...(metadata.extensions as object || {}), telegram };
  }

  const meta = await pinJson(metadata, `${symbol}-metadata`);

  onStatus?.("Reading creation fee…");
  const fee = await getCreationFeeWei();

  return {
    metadataURI: meta.uri,
    imageUrl: image.url,
    creationFeeWei: fee.toString(),
  };
}

/** @deprecated Use prepareLaunchMetadata + client wallet create() */
export async function uploadMetadataToBags(
  name: string,
  symbol: string,
  imageBuffer: Buffer,
  options?: Record<string, unknown>
): Promise<{ metadataUri: string; imageUrl: string | null }> {
  const result = await prepareLaunchMetadata({
    name,
    symbol,
    imageBuffer,
    mimeType: (options?.mimeType as string) || "image/png",
    description: options?.description as string | undefined,
    website: options?.website as string | undefined,
    twitter: options?.twitter as string | undefined,
  });
  return { metadataUri: result.metadataURI, imageUrl: result.imageUrl };
}

/** @deprecated Server no longer sends the launch tx — wallet signs create() */
export async function launchBagsToken(): Promise<never> {
  throw new Error(
    "Server-side launch is disabled. Tokens are launched from your wallet on Robinhood Chain."
  );
}

export function toClaimerAllocations(feeRecipients: FeeRecipientEntry[]): ClaimerAllocation[] {
  return feeRecipients.map((r) => ({
    address: r.wallet,
    bps: r.basisPoints,
  }));
}

export function assertValidFeeRecipients(feeRecipients: FeeRecipientEntry[]): void {
  for (const r of feeRecipients) {
    if (!isEvmAddress(r.wallet)) throw new Error(`Invalid wallet address: ${r.wallet}`);
  }
  const err = validateClaimers(toClaimerAllocations(feeRecipients));
  if (err) throw new Error(err);
}

export { publicClient as bagsPublicClient };
