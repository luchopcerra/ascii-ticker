# ascii-ticker

ASCII market ticker for realtime crypto and digital asset prices over HTTP.

```sh
curl http://localhost:8787
curl http://localhost:8787/btc
curl "http://localhost:8787/eth?currency=eur"
curl "http://localhost:8787/sol?format=json"
```

## Features

- Plain-text output that looks good in a terminal.
- JSON API for apps and scripts.
- Short in-memory cache to reduce upstream API calls.
- Symbol routes like `/btc`, `/eth`, `/sol`, `/usdc`.
- Currency override with `?currency=usd`, `?currency=eur`, etc.

## API

### `GET /`

Returns a terminal-friendly table for the default tracked assets.

### `GET /:asset`

Returns one asset by symbol, id, or name.

Examples: `/btc`, `/bitcoin`, `/ethereum`, `/sol`.

### `GET /api/prices`

Returns JSON for the default tracked assets.

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

## Configuration

Environment variables:

- `CACHE_TTL_MS`: in-memory cache TTL. Default: `30000`.
- `COINGECKO_API_URL`: upstream API base URL. Default: `https://api.coingecko.com/api/v3`.

## Notes

This project uses CoinGecko's public API. For production traffic, add a paid API key or a more robust provider, stronger caching, and rate-limit handling.
