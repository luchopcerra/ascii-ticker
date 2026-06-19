import { assets, findAsset } from "./assets.js";
import { getLeadingIndicators, getPrices, type PriceEnv } from "./coingecko.js";
import { renderAssetPlain, renderAssetTerminal, renderPlain, renderTerminal, type RenderOptions } from "./render.js";

type Env = PriceEnv;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";

      return json({ error: message }, 502);
    }
  }
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ ok: true });
  }

  if (url.pathname === "/api/assets") {
    return json({ assets });
  }

  if (url.pathname === "/api/prices") {
    const currency = url.searchParams.get("currency") ?? "usd";
    const { prices, cacheStatus } = await getPrices({ currency, env });

    return json({ currency: currency.toUpperCase(), cacheStatus, prices });
  }

  const assetParam = pathAsset(url.pathname);
  const asset = assetParam ? findAsset(assetParam) : undefined;

  if (assetParam && !asset) {
    return new Response(`Unknown asset: ${assetParam}\nTry /btc, /eth, /sol, or /api/assets\n`, {
      status: 404,
      headers: textHeaders()
    });
  }

  const currency = url.searchParams.get("currency") ?? "usd";
  const format = url.searchParams.get("format");
  const { prices, cacheStatus } = await getPrices({
    requestedAssets: asset ? [asset] : undefined,
    currency,
    env
  });
  const indicators = asset ? await getLeadingIndicators({ asset, env }) : undefined;
  const renderOptions: RenderOptions = {
    ansi: wantsAnsi(request) && url.searchParams.get("color") !== "never",
    cacheTtlMs: env.CACHE_TTL_MS,
    cacheStatus,
    charset: url.searchParams.get("charset") === "ascii" ? "ascii" : "unicode",
    indicators
  };

  if (format === "json" || wantsJson(request)) {
    return json(asset ? { ...prices[0], cacheStatus, indicators } : { currency: currency.toUpperCase(), cacheStatus, prices });
  }

  const body = asset
    ? `${renderOptions.ansi ? renderAssetTerminal(prices[0], renderOptions) : renderAssetPlain(prices[0], renderOptions)}\n`
    : `${renderOptions.ansi ? renderTerminal(prices, renderOptions) : renderPlain(prices, renderOptions)}\n`;

  return new Response(body, { headers: textHeaders() });
}

function pathAsset(pathname: string): string | undefined {
  const segment = pathname.split("/").filter(Boolean)[0];

  if (!segment || segment === "favicon.ico") {
    return undefined;
  }

  return segment;
}

function wantsJson(request: Request): boolean {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function wantsAnsi(request: Request): boolean {
  const userAgent = request.headers.get("user-agent") ?? "";
  return /curl|httpie|wget/i.test(userAgent);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=15"
    }
  });
}

function textHeaders(): HeadersInit {
  return {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=15"
  };
}
