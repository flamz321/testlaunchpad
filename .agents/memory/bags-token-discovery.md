---
name: Bags.fm Token Discovery via DexScreener
description: How to get the broadest possible set of Bags.fm tokens from DexScreener search.
---

# Bags.fm Token Discovery

## Rule
DexScreener's `/latest/dex/search` returns at most 30 results per query. To surface more Bags.fm tokens, run 50+ parallel searches with diverse seeds and filter results to `dexId === "bags"`.

**Why:** Bags.fm has no public token-listing API endpoint (returns 404). The only practical way to discover bags tokens without an API key is via DexScreener search. Different search terms surface different token names.

## How to apply
Queries used: `["bags", "bags.fm", "a".."z", "sol","doge","pepe","cat","dog","inu","ai","trump","elon","the","big","pro","moon","chad","bear","bull","rich","gold","super","mega","based","frog","king","god","ape","giga"]`

Run in batches of 15 concurrent requests to stay within DexScreener rate limits.

Cache results for 90s. Location: `fetchBagsFmTokensViaDex()` in `server/routes.ts`.
