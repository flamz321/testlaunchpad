/**
 * Startup seed — ensures the $FEATHER native listing placeholder exists in the DB.
 * Safe to run repeatedly; skips insert if the mint is already present.
 */
import { db } from "./db";
import { dexListings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { FEATHER_TOKEN_ADDRESS } from "@shared/chain";

const FEATHER_MINT = FEATHER_TOKEN_ADDRESS;
const SEED_SIGNATURE = "GENESIS_FEATHER_SEED_001";

export async function seedDex() {
  try {
    if (!FEATHER_MINT || FEATHER_MINT === "0x0000000000000000000000000000000000000000") {
      console.log("[seed] $FEATHER token address not set — skipping listing seed");
      return;
    }

    const [existing] = await db
      .select({ id: dexListings.id })
      .from(dexListings)
      .where(eq(dexListings.mintAddress, FEATHER_MINT))
      .limit(1);

    if (existing) {
      console.log("[seed] $FEATHER listing already present (id=%d)", existing.id);
      return;
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 10); // 10-year listing

    await db.insert(dexListings).values({
      mintAddress: FEATHER_MINT,
      name: "Feather",
      ticker: "FEATHER",
      description:
        "The official $FEATHER token. Community governance for Feather App — the token launchpad on Robinhood Chain.",
      logoUrl: "https://feather.app/logo.png",
      website: "https://feather.app",
      twitter: "@featherapp",
      telegram: "https://t.me/FeatherApp",
      discord: null,
      tags: "launchpad,robinhood,community,evm",
      submitterWallet:
        process.env.ADMIN_WALLET || "0x752C3b6CB472D426AD0438f202A46dFa7D58aF34",
      status: "active",
      paymentTxSignature: SEED_SIGNATURE,
      paymentCurrency: "eth",
      paymentAmountRaw: "0",
      expiresAt,
    });

    console.log("[seed] $FEATHER listing inserted successfully.");
  } catch (err) {
    console.error("[seed] Failed to seed $FEATHER listing:", err);
  }
}
