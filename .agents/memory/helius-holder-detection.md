---
name: Helius holder detection
description: How to get Solana token holder wallets when all RPCs are blocked — use Helius REST transaction history.
---

## The Rule
Never use `getTokenAccounts` (Helius RPC extension) or `getTokenLargestAccounts` (public Solana RPC) as the primary holder-fetching strategy. Both are blocked in the Replit environment.

**Why:** `api.mainnet-beta.solana.com` returns HTTP 429 for any heavy RPC call from Replit's shared IPs. The Helius RPC endpoint (`mainnet.helius-rpc.com`) returns -32401 Unauthorized because the project's `HELIUS_API_KEY` is a **REST API key** (UUID format, 36 chars with hyphens) — NOT an RPC key.

## Working Strategy
Use Helius REST enhanced transaction history for the mint address:
```
GET https://api.helius.xyz/v0/addresses/{MINT}/transactions?api-key={KEY}&limit=100
```
Each response includes `tokenTransfers[]` with:
- `toUserAccount` — receiver wallet (real owner address, not token account)
- `fromUserAccount` — sender wallet
- `tokenAmount` — UI amount (already decimal-adjusted)
- `mint` — filter to only this token's mint

Track `received - sent` per wallet for net holdings approximation.

**How to apply:** In `server/helius.ts` `scanToken()`, fetch mint transactions in the initial `Promise.allSettled` alongside metadata + supply, then extract holders from `tokenTransfers`. Fall back to `getTokenLargestAccounts` with 3 retries only if transactions return nothing.

## Notes
- Returns buyers/traders from last 100 transactions — great for new tokens, misses long-tail holders on old ones
- `tokenAmount` in Helius enhanced transactions is the UI amount (decimals applied), not raw lamports
- Querying the mint address returns pool/DEX transactions which DO include the token in their transfers — filter by `t.mint === targetMint`
