# Contributing

Thanks for your interest in improving ascii-ticker.

## Setup

```sh
npm install
npm run dev
```

Wrangler usually serves the Worker at `http://localhost:8787`.

## Verify Changes

Run the typecheck before opening a pull request:

```sh
npm run check
```

For Worker deploy validation, run:

```sh
npx wrangler deploy --dry-run
```

For a focused smoke test, run `npm run dev` and then:

```sh
curl "http://localhost:8787/btc?format=json"
```

## Project Notes

- This is a Cloudflare Worker. Use Worker/web APIs instead of Node server APIs.
- Runtime configuration comes from Worker bindings in `wrangler.jsonc`, not `process.env`.
- Routing lives in `src/worker.ts`.
- Supported assets and aliases live in `src/assets.ts`.
- CoinGecko fetching and cache behavior live in `src/coingecko.ts`.
- Terminal and plain-text output lives in `src/render.ts`.

## Adding Assets

Add new assets in `src/assets.ts` with the correct CoinGecko id, symbol, name, and useful aliases. Keep aliases lowercase and avoid ambiguous short names.

## Pull Requests

- Keep changes focused and small.
- Update `README.md` when user-facing behavior changes.
- Preserve curl-friendly text output unless the change is explicitly about response format.
- Include manual verification notes in the PR.
