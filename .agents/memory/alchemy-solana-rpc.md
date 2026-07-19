---
name: Alchemy Solana RPC
description: Alchemy RPC integration for token holder data — more reliable than public Solana RPCs.
---

## The Rule
Use Alchemy RPC as the primary source for `getTokenLargestAccounts` on Solana. The public `api.mainnet-beta.solana.com` is rate-limited (429) for this call from Replit.

**Why:** Alchemy has much higher rate limits and consistent uptime. The two-step combo gives accurate real owner wallet addresses with current balances:
1. `getTokenLargestAccounts(mint)` → top 20 token account addresses + `uiAmount`
2. `getMultipleAccounts(tokenAccounts, {encoding: "jsonParsed"})` → `parsed.info.owner` = real wallet, `parsed.info.tokenAmount.uiAmount` = balance

**How to apply:** In `server/helius.ts`, the `ALCHEMY_URL` constant is set from `process.env.ALCHEMY_API_KEY`. The `alchemyRpc()` helper sends POST to `https://solana-mainnet.g.alchemy.com/v2/{KEY}`. This is tried first in `scanToken()` before Helius transaction history fallback.

## Response shape for getTokenLargestAccounts
```json
{"address": "...", "amount": "520306993547796444", "decimals": 9, "uiAmount": 520306993.5, "uiAmountString": "..."}
```
Note: `uiAmount` is a `number` (already decimal-adjusted). Use directly.

## Response shape for getMultipleAccounts (jsonParsed)
```json
{"data": {"parsed": {"info": {"owner": "WALLET_ADDRESS", "tokenAmount": {"uiAmount": 520306993.5}}}}}
```

## Fallback chain
1. Alchemy (primary) — disabled if `ALCHEMY_API_KEY` not set
2. Helius REST transaction history — parses tokenTransfers for net positions
3. Public RPC with 3 retries — last resort
