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
- Currency override with `?currency=usd`, `?currency=eur`, etc.

## API

Base URL: `https://ascii-ticker.perezcerraluciano.workers.dev`

### `GET /`

Returns a terminal-friendly table for the default tracked assets, including 7-day sparklines.

Useful query parameters:

- `?assets=btc,eth,sol`: render a custom watchlist by symbol, CoinGecko id, or exact asset name.
- `?holdings=btc:0.25,eth:2.1`: render portfolio mode with total value, per-asset value, and 24h P/L.
- `?currency=eur`: render prices and portfolio values in another currency.
- `?charset=ascii`: use ASCII-only chart and box characters.
- `?color=never`: disable ANSI color.
- `?format=json`: return JSON instead of terminal text.

### `GET /:asset`

Returns one asset by symbol, id, or name as a terminal card by default.

Examples: `/btc`, `/bitcoin`, `/ethereum`, `/sol`.

Useful query parameters:

- `?currency=eur`: render prices in another currency.
- `?charset=ascii`: use ASCII-only chart and box characters.
- `?color=never`: disable ANSI color.
- `?format=json`: return JSON instead of terminal text.

### `GET /help`

Returns terminal-friendly usage help, similar to a CLI `--help` screen.

Aliases: `/--help`, `/-h`, `?help`, `?--help`, and `?-h`.

### `GET /api/prices`

Returns JSON for the default tracked assets, including `cacheStatus` and sparkline arrays.

Useful query parameters:

- `?assets=btc,eth,sol`: return a custom watchlist.
- `?holdings=btc:0.25,eth:2.1`: return prices plus a `portfolio` object with positions, total value, and 24h P/L.
- `?currency=eur`: quote prices and portfolio values in another currency.

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

## Notes

This project uses CoinGecko's public API. For production traffic, add a paid API key or a more robust provider, stronger caching, and rate-limit handling.
