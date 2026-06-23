# ascii-ticker

Terminal-first market ticker for realtime crypto and digital asset prices over HTTP.

It is built to be used from a shell. The default response is text, with terminal graphics, ANSI color for curl/httpie/wget, 7-day sparklines, and cache freshness metadata.

## Quick Start

Copy and paste the command below into your terminal to get the default ticker:

### Bash / Zsh (cURL)
```bash
curl https://ascii-ticker.perezcerraluciano.workers.dev
```
### Windows / PowerShell
```powershell
irm "https://ascii-ticker.perezcerraluciano.workers.dev"
```
##

```sh
curl https://ascii-ticker.perezcerraluciano.workers.dev
curl https://ascii-ticker.perezcerraluciano.workers.dev/btc
curl https://ascii-ticker.perezcerraluciano.workers.dev/help
curl "https://ascii-ticker.perezcerraluciano.workers.dev/eth?currency=eur"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?assets=btc,eth,sol"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?holdings=btc:0.25,eth:2.1"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/compare/btc/eth?range=30d"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/trending"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/feed.txt"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/install"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/wallet/0x0000000000000000000000000000000000000000"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?charset=ascii"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/sol?format=json"
```

Example single-asset terminal output:

```text
┌─ BTC / Bitcoin ─────────────────────────────────────────┐
│ Price      $104,220.11                                  │
│ 24h        ▲ 2.14%                                      │
│ High / Low $105,100.00 / $101,800.00                    │
│ Volume     $42.1B                                       │
│ Source     CoinGecko, fresh, 30000ms ttl                │
├─────────────────────────────────────────────────────────┤
│ 7d         ▁▂▃▄▅▆▇█▇▆▅▄▅▆▇█                             │
├─────────────────────────────────────────────────────────┤
│ Sentiment  Unavailable                                  │
│ Stables    Unavailable                                  │
└─────────────────────────────────────────────────────────┘
```

Local development:

```sh
curl http://localhost:8787
curl http://localhost:8787/btc
curl http://localhost:8787/help
curl "http://localhost:8787/eth?currency=eur"
curl "http://localhost:8787?charset=ascii"
curl "http://localhost:8787/sol?format=json"
```

## Features

- Terminal-first text output with ANSI color for curl/httpie/wget.
- Single-asset cards for routes like `/btc`.
- 7-day sparklines in table and card output.
- ASCII fallback with `?charset=ascii`.
- JSON API for apps and scripts.
- Help output with `/help`, `/--help`, `/-h`, `?help`, `?--help`, or `?-h`.
- Short in-memory cache to reduce upstream API calls, with `fresh`/`cached` metadata in responses.
- Symbol routes like `/btc`, `/eth`, `/sol`, `/usdc`.
- Custom watchlists with `?assets=btc,eth,sol`.
- Portfolio totals and 24h P/L with `?holdings=btc:0.25,eth:2.1`.
- Compare view with `/compare/btc/eth` or `/btc,eth`.
- Sparkline ranges with `?range=1d`, `?range=7d`, or `?range=30d`.
- Trending assets with `/trending`.
- Plain install snippet with `/install`.
- Text and RSS polling feeds with `/feed.txt` and `/rss.xml`.
- Market pulse row derived from 24h changes, BTC/ETH direction, volume velocity, and stablecoin drift.
- Ethereum wallet portfolio lookup with `/wallet/<address>` or `?address=0x...`.
- Currency override with `?currency=usd`, `?currency=eur`, etc.

## API

Base URL: `https://ascii-ticker.perezcerraluciano.workers.dev`

### `GET /`

Returns a terminal-friendly table for the default tracked assets, including 7-day sparklines.

Useful query parameters:

- `?assets=btc,eth,sol`: render a custom watchlist by symbol, CoinGecko id, or exact asset name.
- `?holdings=btc:0.25,eth:2.1`: render portfolio mode with total value, per-asset value, and 24h P/L.
- `?address=0x...`: extract supported Ethereum wallet holdings and render portfolio mode.
- `?chain=ethereum`: wallet chain selector. Ethereum is currently the only supported chain.
- `?currency=eur`: render prices and portfolio values in another currency.
- `?range=1d|7d|30d`: choose the sparkline range. `1d` and `30d` fetch CoinGecko market chart data.
- `?charset=ascii`: use ASCII-only chart and box characters.
- `?color=never`: disable ANSI color.
- `?format=json`: return JSON instead of terminal text.

### `GET /:asset`

Returns one asset by symbol, id, or name as a terminal card by default.

Examples: `/btc`, `/bitcoin`, `/ethereum`, `/sol`.

Useful query parameters:

- `?currency=eur`: render prices in another currency.
- `?range=1d|7d|30d`: choose the card sparkline range.
- `?charset=ascii`: use ASCII-only chart and box characters.
- `?color=never`: disable ANSI color.
- `?format=json`: return JSON instead of terminal text.

### `GET /compare/:asset/:asset`

Compares two or more assets side by side. You can also use the compact alias `GET /btc,eth`.

Examples:

- `/compare/btc/eth`
- `/compare/btc/eth/sol?range=30d`
- `/btc,eth?range=1d`

The compare view shows price, 24h change, volume, market cap, selected-range performance, and selected-range sparkline.

### `GET /trending`

Returns CoinGecko trending search assets in terminal-friendly text. Use `?format=json` or `Accept: application/json` for JSON.

### `GET /install`

Returns shell aliases/functions that wrap the public Worker URL.

### `GET /feed.txt`

Returns a plain text polling feed for the default or custom watchlist.

Useful query parameters:

- `?assets=btc,eth,sol`: feed a custom watchlist.
- `?currency=eur`: quote prices in another currency.
- `?range=1d|7d|30d`: choose the sparkline data range used while fetching.

### `GET /rss.xml`

Returns an RSS 2.0 polling feed for the default or custom watchlist.

### `GET /help`

Returns terminal-friendly usage help, similar to a CLI `--help` screen.

Aliases: `/--help`, `/-h`, `?help`, `?--help`, and `?-h`.

### `GET /wallet/:address`

Extracts supported Ethereum balances from a wallet address, prices them, and returns the same portfolio view used by `?holdings=...`.

Currently scanned assets:

- Native ETH
- USDC
- USDT
- LINK

This route requires `ETHEREUM_RPC_URL` to be configured as a Worker secret or local `.dev.vars` value. Use a private RPC endpoint from a provider such as Chainstack; do not commit the endpoint URL to source.

Current wallet lookup limitations:

- Ethereum addresses only.
- Scans only native ETH, USDC, USDT, and LINK.
- Requires `ETHEREUM_RPC_URL` to be configured.
- Does not include NFT, LP, staking, lending, or debt positions.
- Prices and sparklines depend on CoinGecko availability.

### `GET /api/prices`

Returns JSON for the default tracked assets, including `cacheStatus` and sparkline arrays.

Useful query parameters:

- `?assets=btc,eth,sol`: return a custom watchlist.
- `?holdings=btc:0.25,eth:2.1`: return prices plus a `portfolio` object with positions, total value, and 24h P/L.
- `?address=0x...`: return wallet metadata, prices, and a `portfolio` object for supported Ethereum balances.
- `?currency=eur`: quote prices and portfolio values in another currency.
- `?range=1d|7d|30d`: choose the sparkline range.

### `GET /api/assets`

Returns the supported asset aliases.

### `GET /health`

Returns a simple health check.

## Development

```sh
npm install
npm run dev
```

Open another terminal:

```sh
curl http://localhost:8787/btc
```

Wrangler will print the local URL, usually `http://localhost:8787`.

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

After deploy, Cloudflare will print the public Worker URL.

## Automatic deploys from GitHub

Merges to `main` trigger `.github/workflows/deploy.yml`, which installs dependencies, runs `npm run check` and `npm run build`, then deploys with Wrangler.

Configure these repository secrets first so the workflow can deploy:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Configuration

Environment variables:

- `CACHE_TTL_MS`: in-memory cache TTL. Default: `30000`.
- `COINGECKO_API_URL`: upstream API base URL. Default: `https://api.coingecko.com/api/v3`.
- `ETHEREUM_RPC_URL`: Ethereum JSON-RPC HTTPS endpoint for wallet balance lookup. Configure it with `npx wrangler secret put ETHEREUM_RPC_URL` for deployed Workers, or `.dev.vars` for local development.

## Notes

This project uses CoinGecko's public API. For production traffic, add a paid API key or a more robust provider, stronger caching, and rate-limit handling.

Non-crypto assets such as stocks, ETFs, commodities, and forex pairs are not currently supported. The current data path is CoinGecko-only, so adding non-crypto markets would require a second market data provider and a clear symbol namespace such as `/stocks/aapl` or `/fx/eur-usd`.
