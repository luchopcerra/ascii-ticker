import { assets, findAsset } from "./assets.js";
import {
  getLeadingIndicators,
  getPrices,
  type LeadingIndicators,
  type MarketPrice,
  type PriceEnv,
  type SocialSentiment,
  type StablecoinFlow
} from "./coingecko.js";
import { renderAssetPlain, renderAssetTerminal, renderPlain, renderTerminal, type RenderOptions } from "./render.js";

type Env = PriceEnv;
// Avoid division-by-zero when deriving a percent change from tiny sparkline baselines.
const minPriceBaseline = 1e-10;
// Heuristic fallback tuning for when optional indicator APIs are not configured:
// normalize ~10% daily moves into a full sentiment scale, keep ±0.15 near neutral,
// treat sub-0.5% moves as stable, and weight volume velocity into the flow gauge.
const sentimentNormalizationFactor = 10;
const sentimentThreshold = 0.15;
const stablecoinNeutralThreshold = 0.5;
const stablecoinVelocityMultiplier = 8;

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
  if (asset && prices.length === 0) {
    throw new Error(`CoinGecko returned no market data for ${asset.symbol.toUpperCase()}`);
  }
  const indicators = asset ? withIndicatorFallbacks(prices[0], await getLeadingIndicators({ asset, env })) : undefined;
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

function withIndicatorFallbacks(price: MarketPrice, indicators: LeadingIndicators): LeadingIndicators {
  return {
    sentiment: indicators.sentiment.label === "unavailable" ? fallbackSentiment(price) : indicators.sentiment,
    stablecoinFlow:
      indicators.stablecoinFlow.label === "unavailable" ? fallbackStablecoinFlow(price) : indicators.stablecoinFlow
  };
}

function fallbackSentiment(price: MarketPrice): SocialSentiment {
  const changeSignal = priceChangeSignal(price);

  if (changeSignal === null) {
    return {
      score: null,
      label: "unavailable",
      source: "CoinGecko price proxy",
      updatedAt: price.updatedAt
    };
  }

  const score = clamp(changeSignal / sentimentNormalizationFactor, -1, 1);

  return {
    score,
    label: sentimentLabel(score),
    source: "CoinGecko price proxy",
    updatedAt: price.updatedAt
  };
}

function fallbackStablecoinFlow(price: MarketPrice): StablecoinFlow {
  const changeSignal = priceChangeSignal(price);
  // Volume divided by market cap acts as a simple trading-velocity proxy for flow intensity.
  const velocity = price.volume24h !== null && price.marketCap !== null && price.marketCap > 0 ? price.volume24h / price.marketCap : null;
  const ratio = clamp(
    average([
      changeSignal === null ? null : Math.abs(changeSignal) / sentimentNormalizationFactor,
      velocity === null ? null : velocity * stablecoinVelocityMultiplier
    ]) ?? 0,
    0,
    1
  );
  // Scale volume by signed daily price change to approximate direction and magnitude of net flow.
  const netFlowUsd = price.volume24h === null || changeSignal === null ? null : price.volume24h * (changeSignal / 100);

  return {
    netFlowUsd,
    ratio,
    label: stablecoinLabel(changeSignal),
    source: "CoinGecko volume proxy",
    updatedAt: price.updatedAt
  };
}

function priceChangeSignal(price: MarketPrice): number | null {
  if (price.change24h !== null) {
    return price.change24h;
  }

  const start = price.sparkline.find(Number.isFinite);
  const end = [...price.sparkline].reverse().find(Number.isFinite);

  if (start === undefined || end === undefined || Math.abs(start) < minPriceBaseline) {
    return null;
  }

  return ((end - start) / start) * 100;
}

function sentimentLabel(score: number): SocialSentiment["label"] {
  if (score > sentimentThreshold) {
    return "bullish";
  }

  if (score < -sentimentThreshold) {
    return "bearish";
  }

  return "neutral";
}

function stablecoinLabel(changeSignal: number | null): StablecoinFlow["label"] {
  if (changeSignal === null || Math.abs(changeSignal) < stablecoinNeutralThreshold) {
    return "neutral";
  }

  return changeSignal > 0 ? "inflow" : "outflow";
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);

  if (present.length === 0) {
    return null;
  }

  return present.reduce((total, value) => total + value, 0) / present.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
