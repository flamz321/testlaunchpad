---
name: Bags.fm Bonding Progress Estimation
description: How to estimate bonding curve progress for Bags.fm tokens without on-chain data.
---

# Bonding Progress Estimation

## Rule
Bags.fm tokens graduate from the bonding curve at approximately $69,000 market cap (same as Pump.fun). Estimate bondingProgress as `min(100, round(marketCap / 69000 * 100))`.

**Why:** DexScreener market data does not expose the raw bonding curve percentage. Using market cap as a proxy gives a usable "Graduating" sort filter.

## How to apply
Applied in `fetchBagsFmTokensViaDex()` in `server/routes.ts` when building the token list.
The "Graduating" filter tab in Home.tsx sorts tokens by bondingProgress descending.
