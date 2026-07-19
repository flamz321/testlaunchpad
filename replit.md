# Feather App — Robinhood Chain Token Launchpad + DEX + Social

A Telegram bot (@FeatherAppBot) and Discord bot for Feather App on **Robinhood Chain (EVM)**. The site at feather.app includes a DEX listing platform at `/dex` and a community social layer at `/social` with $FEATHER tiers, leaderboards, bounty board, DM inbox, VIP lounge, and admin moderation.

## Architecture

- **Backend**: Express.js + TypeScript
- **Telegram Bot**: node-telegram-bot-api (polling / webhook)
- **Discord Bot**: discord.js v14 (gateway/WebSocket mode)
- **Blockchain**: Robinhood Chain (EVM, Chain ID 4663) via viem
- **Token Launch**: Website launchpad (Uniswap-oriented); legacy Pump.fun / Bags.fm Solana paths discontinued
- **Database**: PostgreSQL via Drizzle ORM
- **Frontend**: React app (launches, DEX, social, intel)
- **Security**: helmet.js for HTTP security headers

## Key Files

- `server/telegram.ts` — Telegram bot logic, conversation state, launch flow
- `server/discord.ts` — Discord bot logic (slash commands + multi-step message flow)
- `server/pumpfun.ts` — Legacy Pump.fun stubs + optional Pinata IPFS helper
- `server/bagsfm.ts` — Legacy Bags.fm stubs (discontinued)
- `server/helius.ts` — Robinhood Chain wallet/token intel (viem + Blockscout + Alchemy)
- `server/marketdata.ts` — DexScreener Robinhood Chain market stats + signals
- `server/launchFeedCache.ts` — DexScreener robinhood launch feed cache
- `server/routes.ts` — Express API routes
- `server/dex.ts` — DEX module: EVM payment verification, DexScreener proxy
- `server/tokengate.ts` — $FEATHER ERC-20 balance + ownership verification
- `shared/chain.ts` — Robinhood Chain constants (RPC, explorer, WETH, FEATHER)
- `shared/schema.ts` — Drizzle table definitions

## Environment Variables Required

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather on Telegram |
| `DISCORD_BOT_TOKEN` | From Discord Developer Portal |
| `DISCORD_OWNER_ID` | Owner's Discord user ID (for /pause, /resume, /status commands) |
| `RPC_URL` / `ALCHEMY_API_KEY` | Robinhood Chain RPC (Alchemy optional) |
| `FEATHER_TOKEN_ADDRESS` | $FEATHER ERC-20 contract on Robinhood Chain |
| `ADMIN_WALLET` | Admin EVM wallet (0x…) |
| `DATABASE_URL` | PostgreSQL connection string |
| `VITE_TELEGRAM_BOT_USERNAME` | Set to `FeatherAppBot` (for website links) |

## Git & Deployment

- **VPS deploy**: build + `pm2 restart feather-app`
- Deploy webhook URL should point at the production Feather App host

## Commands (Both Bots)

- `/start` (Telegram) / `/help` — Welcome + usage instructions
- `/launch CoinName, TICKER` — Start a token launch flow
- `skip` / `/skip` — Skip current step
- `cancel` / `/cancel` — Cancel a pending launch
- `/signal` — Robinhood Chain market signal
- `/pause` / `/resume` / `/status` — Owner only
