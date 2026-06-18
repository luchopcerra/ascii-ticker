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
};

export type PriceResult = {
  prices: MarketPrice[];
  cacheStatus: "cached" | "fresh";
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
};

type CacheEntry = {
  expiresAt: number;
  prices: MarketPrice[];
};

const cache = new Map<string, CacheEntry>();

export type PriceEnv = {
  CACHE_TTL_MS?: string;
  COINGECKO_API_URL?: string;
};

export async function getPrices(options: {
  requestedAssets?: Asset[];
  currency?: string;
  env?: PriceEnv;
} = {}): Promise<PriceResult> {
  const requestedAssets = options.requestedAssets?.length ? options.requestedAssets : assets.slice(0, 8);
  const currency = (options.currency ?? "usd").toLowerCase();
  const cacheTtlMs = Number(options.env?.CACHE_TTL_MS ?? 30_000);
  const apiBaseUrl = options.env?.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";
  const ids = requestedAssets.map((asset) => asset.id).join(",");
  const cacheKey = `${currency}:${ids}`;
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
  url.searchParams.set("sparkline", "false");
  url.searchParams.set("price_change_percentage", "24h");

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
  const prices = payload.map((market) => ({
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
    updatedAt: market.last_updated
  }));

  cache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    prices
  });

  return { prices, cacheStatus: "fresh" };
}
