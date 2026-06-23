import { assets, type Asset } from "./assets.js";

export type MarketPrice = {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  price: number;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  updatedAt: string;
  sparkline: number[];
};

export type PriceRange = "1d" | "7d" | "30d";

export type PriceResult = {
  prices: MarketPrice[];
  cacheStatus: "cached" | "fresh";
};

export type TrendingCoin = {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  score: number;
};

export type SocialSentiment = {
  score: number | null;
  label: "bearish" | "neutral" | "bullish" | "unavailable";
  source: string;
  updatedAt: string | null;
};

export type StablecoinFlow = {
  netFlowUsd: number | null;
  ratio: number | null;
  label: "inflow" | "neutral" | "outflow" | "unavailable";
  source: string;
  updatedAt: string | null;
};

export type LeadingIndicators = {
  sentiment: SocialSentiment;
  stablecoinFlow: StablecoinFlow;
};

type CoinGeckoMarket = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  last_updated: string;
  sparkline_in_7d?: {
    price?: number[];
  };
};

type CoinGeckoMarketChart = {
  prices?: Array<[number, number]>;
};

type CoinGeckoTrendingResponse = {
  coins?: Array<{
    item?: {
      id?: string;
      symbol?: string;
      name?: string;
      market_cap_rank?: number | null;
      score?: number;
    };
  }>;
};

type CacheEntry = {
  expiresAt: number;
  prices: MarketPrice[];
};

type TrendingCacheEntry = {
  expiresAt: number;
  coins: TrendingCoin[];
};

type IndicatorCacheEntry = {
  expiresAt: number;
  indicators: LeadingIndicators;
};

const cache = new Map<string, CacheEntry>();
const indicatorCache = new Map<string, IndicatorCacheEntry>();
const trendingCache = new Map<string, TrendingCacheEntry>();
const INDICATOR_CACHE_TTL_MS = 5 * 60_000;
const TRENDING_CACHE_TTL_MS = 5 * 60_000;

export type PriceEnv = {
  CACHE_TTL_MS?: string;
  COINGECKO_API_URL?: string;
  COINGECKO_API_KEY?: string;
  SENTIMENT_API_URL?: string;
  SENTIMENT_API_KEY?: string;
  STABLECOIN_FLOW_API_URL?: string;
  STABLECOIN_FLOW_API_KEY?: string;
};

export async function getPrices(options: {
  requestedAssets?: Asset[];
  currency?: string;
  range?: PriceRange;
  env?: PriceEnv;
} = {}): Promise<PriceResult> {
  const requestedAssets = options.requestedAssets?.length ? options.requestedAssets : assets;
  const currency = (options.currency ?? "usd").toLowerCase();
  const range = options.range ?? "7d";
  const cacheTtlMs = Number(options.env?.CACHE_TTL_MS ?? 30_000);
  const apiBaseUrl = options.env?.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";
  const ids = requestedAssets.map((asset) => asset.id).join(",");
  const cacheKey = `${currency}:${range}:${ids}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return { prices: cached.prices, cacheStatus: "cached" };
  }

  const url = new URL("/api/v3/coins/markets", apiBaseUrl);
  url.searchParams.set("vs_currency", currency);
  url.searchParams.set("ids", ids);
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(requestedAssets.length));
  url.searchParams.set("page", "1");
  url.searchParams.set("sparkline", "true");
  url.searchParams.set("price_change_percentage", "24h");

  const apiKey = configuredValue(options.env?.COINGECKO_API_KEY);
  if (apiKey) {
    url.searchParams.set("x_cg_demo_api_key", apiKey);
    console.log("CoinGecko API key set, fetching with auth");
  } else {
    console.log("No CoinGecko API key configured, fetching without auth");
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "ascii-ticker/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`CoinGecko returned ${response.status}`);
  }

  const payload = (await response.json()) as CoinGeckoMarket[];
  let prices = payload.map((market) => ({
    id: market.id,
    symbol: market.symbol.toUpperCase(),
    name: market.name,
    currency: currency.toUpperCase(),
    price: market.current_price,
    marketCap: market.market_cap,
    volume24h: market.total_volume,
    change24h: market.price_change_percentage_24h,
    high24h: market.high_24h,
    low24h: market.low_24h,
    updatedAt: market.last_updated,
    sparkline: market.sparkline_in_7d?.price ?? []
  }));

  if (range !== "7d") {
    prices = await withMarketChartSparklines({
      prices,
      range,
      currency,
      apiBaseUrl,
      apiKey
    });
  }

  cache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    prices
  });

  return { prices, cacheStatus: "fresh" };
}

export async function getTrendingCoins(options: {
  env?: PriceEnv;
  limit?: number;
} = {}): Promise<TrendingCoin[]> {
  const apiBaseUrl = options.env?.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";
  const cacheKey = `${apiBaseUrl}:trending:${options.limit ?? 10}`;
  const cached = trendingCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.coins;
  }

  const url = new URL("/api/v3/search/trending", apiBaseUrl);
  const apiKey = configuredValue(options.env?.COINGECKO_API_KEY);
  if (apiKey) {
    url.searchParams.set("x_cg_demo_api_key", apiKey);
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "ascii-ticker/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`CoinGecko trending returned ${response.status}`);
  }

  const payload = (await response.json()) as CoinGeckoTrendingResponse;
  const coins = (payload.coins ?? [])
    .map((coin, index) => {
      const item = coin.item;
      if (!item?.id || !item.symbol || !item.name) {
        return undefined;
      }

      return {
        id: item.id,
        symbol: item.symbol.toUpperCase(),
        name: item.name,
        marketCapRank: item.market_cap_rank ?? null,
        score: item.score ?? index
      };
    })
    .filter((coin): coin is TrendingCoin => coin !== undefined)
    .slice(0, options.limit ?? 10);

  trendingCache.set(cacheKey, {
    expiresAt: Date.now() + TRENDING_CACHE_TTL_MS,
    coins
  });

  return coins;
}

async function withMarketChartSparklines(options: {
  prices: MarketPrice[];
  range: PriceRange;
  currency: string;
  apiBaseUrl: string;
  apiKey?: string;
}): Promise<MarketPrice[]> {
  const days = options.range === "1d" ? "1" : "30";
  const charts = await Promise.all(
    options.prices.map(async (price) => {
      const url = new URL(`/api/v3/coins/${price.id}/market_chart`, options.apiBaseUrl);
      url.searchParams.set("vs_currency", options.currency);
      url.searchParams.set("days", days);

      if (options.apiKey) {
        url.searchParams.set("x_cg_demo_api_key", options.apiKey);
      }

      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "ascii-ticker/0.1"
        }
      });

      if (!response.ok) {
        throw new Error(`CoinGecko market chart returned ${response.status} for ${price.id}`);
      }

      const payload = (await response.json()) as CoinGeckoMarketChart;
      const sparkline = (payload.prices ?? [])
        .map((point) => point[1])
        .filter(Number.isFinite);

      return { ...price, sparkline };
    })
  );

  return charts;
}

export async function getLeadingIndicators(options: {
  asset: Asset;
  env?: PriceEnv;
}): Promise<LeadingIndicators> {
  const sentimentApiUrl = configuredValue(options.env?.SENTIMENT_API_URL);
  const stablecoinFlowApiUrl = configuredValue(options.env?.STABLECOIN_FLOW_API_URL);
  const cacheKey = buildIndicatorCacheKey(options.asset, sentimentApiUrl, stablecoinFlowApiUrl);
  const cached = indicatorCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.indicators;
  }

  const [sentimentResult, stablecoinFlowResult] = await Promise.allSettled([
    sentimentApiUrl
      ? fetchSocialSentiment(options.asset, sentimentApiUrl, options.env?.SENTIMENT_API_KEY)
      : Promise.resolve(unavailableSentiment()),
    stablecoinFlowApiUrl
      ? fetchStablecoinFlow(options.asset, stablecoinFlowApiUrl, options.env?.STABLECOIN_FLOW_API_KEY)
      : Promise.resolve(unavailableStablecoinFlow())
  ]);

  const indicators: LeadingIndicators = {
    sentiment: settledValue(sentimentResult, unavailableSentiment()),
    stablecoinFlow: settledValue(stablecoinFlowResult, unavailableStablecoinFlow())
  };

  indicatorCache.set(cacheKey, {
    expiresAt: Date.now() + INDICATOR_CACHE_TTL_MS,
    indicators
  });

  return indicators;
}

async function fetchSocialSentiment(asset: Asset, apiUrl: string, apiKey?: string): Promise<SocialSentiment> {
  const payload = await fetchIndicatorPayload(asset, apiUrl, apiKey);
  const source = readString(payload, ["source", "provider"]) ?? urlSource(apiUrl);
  const score = clamp(readNumber(payload, ["score", "sentimentScore", "value"]), -1, 1);
  const label = readSentimentLabel(payload, score);

  return {
    score,
    label,
    source,
    updatedAt: readString(payload, ["updatedAt", "updated_at", "lastUpdated", "timestamp"])
  };
}

async function fetchStablecoinFlow(asset: Asset, apiUrl: string, apiKey?: string): Promise<StablecoinFlow> {
  const payload = await fetchIndicatorPayload(asset, apiUrl, apiKey);
  const source = readString(payload, ["source", "provider"]) ?? urlSource(apiUrl);
  const netFlowUsd = readNumber(payload, ["netFlowUsd", "net_flow_usd", "netFlow", "value"]);
  const ratio = clamp(readNumber(payload, ["ratio", "normalizedRatio", "normalized_ratio", "normalized", "score"]), 0, 1);
  const label = readStablecoinLabel(payload, netFlowUsd);

  return {
    netFlowUsd,
    ratio,
    label,
    source,
    updatedAt: readString(payload, ["updatedAt", "updated_at", "lastUpdated", "timestamp"])
  };
}

async function fetchIndicatorPayload(asset: Asset, apiUrl: string, apiKey?: string): Promise<Record<string, unknown>> {
  const url = new URL(apiUrl);
  url.searchParams.set("assetSymbol", asset.symbol);
  url.searchParams.set("assetId", asset.id);
  url.searchParams.set("assetName", asset.name);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...indicatorAuthHeaders(apiKey),
      "user-agent": "ascii-ticker/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Indicator source returned ${response.status}`);
  }

  return normalizeIndicatorPayload(await response.json());
}

function normalizeIndicatorPayload(payload: unknown): Record<string, unknown> {
  if (isRecord(payload)) {
    if (isRecord(payload.data)) {
      return payload.data;
    }

    return payload;
  }

  if (Array.isArray(payload)) {
    const first = payload.find(isRecord);
    if (first) {
      return first;
    }
  }

  throw new Error("Indicator payload was not an object");
}

function indicatorAuthHeaders(apiKey?: string): HeadersInit {
  const key = configuredValue(apiKey);

  if (!key) {
    return {};
  }

  return {
    "x-api-key": key
  };
}

function unavailableSentiment(): SocialSentiment {
  return {
    score: null,
    label: "unavailable",
    source: "unavailable",
    updatedAt: null
  };
}

function unavailableStablecoinFlow(): StablecoinFlow {
  return {
    netFlowUsd: null,
    ratio: null,
    label: "unavailable",
    source: "unavailable",
    updatedAt: null
  };
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function buildIndicatorCacheKey(asset: Asset, sentimentApiUrl?: string, stablecoinFlowApiUrl?: string): string {
  return JSON.stringify({
    assetId: asset.id,
    assetSymbol: asset.symbol,
    sentimentApiUrl: sentimentApiUrl ?? null,
    stablecoinFlowApiUrl: stablecoinFlowApiUrl ?? null
  });
}

function readSentimentLabel(payload: Record<string, unknown>, score: number | null): SocialSentiment["label"] {
  const label = readString(payload, ["label", "sentiment", "signal"])?.toLowerCase();

  if (label === "bearish" || label === "neutral" || label === "bullish") {
    return label;
  }

  if (score === null) {
    return "unavailable";
  }

  if (score > 0) {
    return "bullish";
  }

  if (score < 0) {
    return "bearish";
  }

  return "neutral";
}

function readStablecoinLabel(payload: Record<string, unknown>, netFlowUsd: number | null): StablecoinFlow["label"] {
  const label = readString(payload, ["label", "flow", "signal"])?.toLowerCase();

  if (label === "inflow" || label === "neutral" || label === "outflow") {
    return label;
  }

  if (netFlowUsd === null) {
    return "unavailable";
  }

  if (netFlowUsd > 0) {
    return "inflow";
  }

  if (netFlowUsd < 0) {
    return "outflow";
  }

  return "neutral";
}

function readString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function readNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function clamp(value: number | null, min: number, max: number): number | null {
  if (value === null) {
    return null;
  }

  return Math.min(Math.max(value, min), max);
}

function configuredValue(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function urlSource(apiUrl: string): string {
  return new URL(apiUrl).hostname;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
