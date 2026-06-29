# ascii-ticker

Terminal-first market ticker for realtime crypto, stock, ETF, and index prices over HTTP.

It is built to be used from a shell. Responses default to text, with terminal graphics, ANSI color for curl/httpie/wget, sparklines, and cache freshness metadata.

## Quick Start

Copy and paste the command below into your terminal to discover available routes and examples:

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
curl https://ascii-ticker.perezcerraluciano.workers.dev/aapl
curl https://ascii-ticker.perezcerraluciano.workers.dev/spy
curl https://ascii-ticker.perezcerraluciano.workers.dev/aapl:nasdaq
curl https://ascii-ticker.perezcerraluciano.workers.dev/help
curl "https://ascii-ticker.perezcerraluciano.workers.dev/eth?currency=eur"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?assets=btc,eth,sol"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?assets=btc,eth,spy,qqq"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?holdings=btc:0.25,eth:2.1"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/compare/btc/eth?range=30d"
curl "https://ascii-ticker.perezcerraluciano.workers.dev/compare/aapl/msft/nvda"
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
curl http://localhost:8787/aapl
curl http://localhost:8787/help
curl "http://localhost:8787/eth?currency=eur"
curl "http://localhost:8787?assets=btc,eth,spy,qqq"
curl "http://localhost:8787?charset=ascii"
curl "http://localhost:8787/sol?format=json"
```

## Features

- Terminal-first text output with ANSI color for curl/httpie/wget.
- Root discovery screen at `/` with common examples and route pointers.
- Single-asset cards for crypto routes like `/btc` and Google Finance routes like `/aapl`.
- Explicit Google Finance ticker syntax with `/ticker:exchange`, for example `/aapl:nasdaq` or `/spy:nysearca`.
- Sparkline output in table and card views.
- ASCII fallback with `?charset=ascii`.
- JSON API for apps and scripts.
- Help output with `/help`, `/--help`, `/-h`, `?help`, `?--help`, or `?-h`.
- Short in-memory cache to reduce upstream API calls, with `fresh`/`cached` metadata in responses.
- Symbol routes like `/btc`, `/eth`, `/sol`, `/usdc`, `/aapl`, `/spy`, `/qqq`.
- Custom watchlists with `?assets=btc,eth,sol` or mixed markets like `?assets=btc,eth,spy,qqq`.
- Portfolio totals and 24h P/L with `?holdings=btc:0.25,eth:2.1`.
- Compare view with `/compare/btc/eth` or `/btc,eth`.
- Sparkline ranges with `?range=1d`, `?range=7d`, or `?range=30d`.
- Trending assets with `/trending`.
- Plain install snippet with `/install`.
- Text and RSS polling feeds with `/feed.txt` and `/rss.xml`.
- Market pulse row derived from 24h changes, BTC/ETH direction, volume velocity, and stablecoin drift.
- Ethereum wallet portfolio lookup with `/wallet/<address>` or `?address=0x...`.
- Currency override with `?currency=usd`, `?currency=eur`, etc.
- SerpAPI Google Finance integration for stocks, ETFs, indices, and dynamic ticker lookups.

## API

Base URL: `https://ascii-ticker.perezcerraluciano.workers.dev`

### `GET /`

Returns a terminal-friendly discovery screen with examples, route pointers, and data source notes.

Use query parameters to turn `/` into a ticker view:

```sh
curl "https://ascii-ticker.perezcerraluciano.workers.dev?assets=btc,eth,sol"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?assets=btc,eth,spy,qqq"
curl "https://ascii-ticker.perezcerraluciano.workers.dev?holdings=btc:0.25,eth:2.1"
```

Useful query parameters:

- `?assets=btc,eth,sol`: render a custom crypto watchlist by symbol, CoinGecko id, or exact asset name.
- `?assets=btc,eth,spy,qqq`: render a mixed crypto, ETF, and stock watchlist.
- `?holdings=btc:0.25,eth:2.1`: render portfolio mode with total value, per-asset value, and 24h P/L.
- `?address=0x...`: extract supported Ethereum wallet holdings and render portfolio mode.
- `?chain=ethereum`: wallet chain selector. Ethereum is currently the only supported chain.
- `?currency=eur`: render prices and portfolio values in another currency.
- `?range=1d|7d|30d`: choose the sparkline range. CoinGecko uses market chart data; SerpAPI maps these to Google Finance windows.
- `?charset=ascii`: use ASCII-only chart and box characters.
- `?color=never`: disable ANSI color.
- `?format=json`: return JSON instead of terminal text.

### `GET /:asset`

Returns one asset or ticker by symbol, id, or name as a terminal card by default.

Crypto examples: `/btc`, `/bitcoin`, `/ethereum`, `/sol`.

Registered Google Finance examples: `/aapl`, `/msft`, `/nvda`, `/spy`, `/qqq`, `/spx`.

Dynamic Google Finance examples with exchange override: `/aapl:nasdaq`, `/brk.b:nyse`, `/spy:nysearca`, `/dji:indexdjx`.

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
- `/compare/aapl/msft/nvda`
- `/compare/btc/eth/spy/qqq`
- `/btc,eth?range=1d`

The compare view shows price, 24h change, volume, market cap, selected-range performance, and selected-range sparkline.

### `GET /trending`

Returns CoinGecko trending search assets in terminal-friendly text. Use `?format=json` or `Accept: application/json` for JSON.

### `GET /install`

Returns shell aliases/functions that wrap the public Worker URL.

### `GET /feed.txt`

Returns a plain text polling feed for the default or custom watchlist.

Useful query parameters:

- `?assets=btc,eth,sol`: feed a custom crypto watchlist.
- `?assets=btc,eth,spy,qqq`: feed a mixed market watchlist.
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

Returns JSON for the default crypto assets, or for a requested watchlist, including `cacheStatus` and sparkline arrays.

Useful query parameters:

- `?assets=btc,eth,sol`: return a custom crypto watchlist.
- `?assets=btc,eth,spy,qqq`: return a mixed crypto and traditional market watchlist.
- `?holdings=btc:0.25,eth:2.1`: return prices plus a `portfolio` object with positions, total value, and 24h P/L.
- `?address=0x...`: return wallet metadata, prices, and a `portfolio` object for supported Ethereum balances.
- `?currency=eur`: quote prices and portfolio values in another currency.
- `?range=1d|7d|30d`: choose the sparkline range.

### `GET /api/assets`

Returns supported asset aliases, including crypto assets and pre-registered SerpAPI Google Finance tickers.

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
curl http://localhost:8787/aapl
curl "http://localhost:8787?assets=btc,eth,spy,qqq"
```

Wrangler will print the local URL, usually `http://localhost:8787`.

## Manual deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

After deploy, Cloudflare will print the public Worker URL. Use this as a
manual fallback when you intentionally need Wrangler to deploy outside the
linked Git flow below.

## Cloudflare-linked deploys from GitHub

This repository is linked to Cloudflare Workers through the Cloudflare GitHub
integration:

- pull requests get Cloudflare preview deployments
- updates to `main` deploy production

`.github/workflows/deploy.yml` is a manual Wrangler fallback. It still runs
`npm run check` and `npm run build` before deploying, but it is not the default
production path.

Configure these repository secrets first if you want the manual fallback
workflow to deploy:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Configuration

Environment variables:

- `CACHE_TTL_MS`: in-memory cache TTL. Default: `30000`.
- `COINGECKO_API_URL`: upstream API base URL. Default: `https://api.coingecko.com/api/v3`.
- `SERPAPI_API_URL`: SerpAPI search endpoint. Default: `https://serpapi.com/search`.
- `SERPAPI_API_KEY`: SerpAPI key for Google Finance lookups. Configure it with `npx wrangler secret put SERPAPI_API_KEY` for deployed Workers, or `.dev.vars` for local development. Do not put this in `wrangler.jsonc`.
- `ETHEREUM_RPC_URL`: Ethereum JSON-RPC HTTPS endpoint for wallet balance lookup. Configure it with `npx wrangler secret put ETHEREUM_RPC_URL` for deployed Workers, or `.dev.vars` for local development.

## Notes

Crypto data comes from CoinGecko. Stocks, ETFs, indices, and dynamic ticker lookups come from SerpAPI Google Finance and require `SERPAPI_API_KEY`.

For production traffic, use provider API keys, monitor rate limits, and tune `CACHE_TTL_MS` for your traffic pattern.
