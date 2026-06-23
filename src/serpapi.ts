import type { MarketPrice, PriceRange, PriceResult } from "./coingecko.js";

export type SerpapiEnv = {
  CACHE_TTL_MS?: string;
  SERPAPI_API_URL?: string;
  SERPAPI_API_KEY?: string;
};

type SerpapiFinanceResponse = {
  error?: string;
  summary?: {
    title?: string;
    stock?: string;
    exchange?: string;
    extracted_price?: number;
    currency?: string;
    date?: string;
    price_movement?: {
      percentage?: number;
      movement?: string;
    };
  };
  graph?: Array<{
    price?: number;
    currency?: string;
    date?: string;
    volume?: number;
  }>;
  knowledge_graph?: {
    key_stats?: {
      stats?: Array<{
        label?: string;
        value?: string;
      }>;
    };
  };
  suggestions?: Array<{
    stock?: string;
    name?: string;
  }>;
};

type CacheEntry = {
  expiresAt: number;
  price: MarketPrice;
};

const cache = new Map<string, CacheEntry>();
const defaultApiUrl = "https://serpapi.com/search";
const defaultExchangeCandidates = ["NASDAQ", "NYSE", "NYSEARCA"];

export async function getFinancePrice(options: {
  query: string;
  range?: PriceRange;
  env?: SerpapiEnv;
}): Promise<PriceResult> {
  const range = options.range ?? "7d";
  const cacheTtlMs = Number(options.env?.CACHE_TTL_MS ?? 30_000);
  const parsed = parseFinanceQuery(options.query);
  const candidates = parsed.exchange
    ? [`${parsed.symbol}:${parsed.exchange}`]
    : defaultExchangeCandidates.map((exchange) => `${parsed.symbol}:${exchange}`);
  const cacheKey = `${range}:${candidates.join(",")}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return { prices: [cached.price], cacheStatus: "cached" };
  }

  let lastError: Error | undefined;
  for (const candidate of candidates) {
    try {
      const price = await fetchFinancePrice({
        query: candidate,
        range,
        env: options.env
      });

      cache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        price
      });

      return { prices: [price], cacheStatus: "fresh" };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("SerpAPI Google Finance lookup failed");
    }
  }

  throw lastError ?? new Error(`SerpAPI Google Finance returned no market data for ${options.query}`);
}

export function isFinanceTickerInput(input: string): boolean {
  return /^[a-z0-9._-]+(?::[a-z0-9._-]+)?$/i.test(input.trim());
}

function parseFinanceQuery(input: string): { symbol: string; exchange?: string } {
  const [symbolInput, exchangeInput] = input.trim().split(":", 2);
  const symbol = symbolInput.toUpperCase();
  const exchange = exchangeInput?.toUpperCase();

  if (!symbol || !isFinanceTickerInput(input)) {
    throw new Error(`Invalid ticker: ${input}`);
  }

  return { symbol, ...(exchange ? { exchange } : {}) };
}

async function fetchFinancePrice(options: {
  query: string;
  range: PriceRange;
  env?: SerpapiEnv;
}): Promise<MarketPrice> {
  const apiKey = configuredValue(options.env?.SERPAPI_API_KEY);
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not configured. Set it with `npx wrangler secret put SERPAPI_API_KEY`.");
  }

  const url = new URL(options.env?.SERPAPI_API_URL ?? defaultApiUrl);
  url.searchParams.set("engine", "google_finance");
  url.searchParams.set("q", options.query);
  url.searchParams.set("window", serpapiWindow(options.range));
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("output", "json");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "ascii-ticker/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`SerpAPI Google Finance returned ${response.status} for ${options.query}`);
  }

  const payload = (await response.json()) as SerpapiFinanceResponse;
  if (payload.error) {
    throw new Error(`SerpAPI Google Finance error for ${options.query}: ${payload.error}`);
  }

  return normalizeFinancePrice(payload, options.query);
}

function normalizeFinancePrice(payload: SerpapiFinanceResponse, query: string): MarketPrice {
  const summary = payload.summary;
  if (typeof summary?.extracted_price !== "number" || !Number.isFinite(summary.extracted_price)) {
    const suggestions = payload.suggestions?.map((suggestion) => suggestion.stock).filter(Boolean).join(", ");
    const suffix = suggestions ? `. Suggestions: ${suggestions}` : "";
    throw new Error(`SerpAPI Google Finance returned no market data for ${query}${suffix}`);
  }

  const stock = summary.stock ?? query.split(":")[0];
  const exchange = summary.exchange ?? query.split(":")[1];
  const stats = payload.knowledge_graph?.key_stats?.stats ?? [];
  const dayRange = readStat(stats, "day range");
  const [low24h, high24h] = dayRange ? parseRangeValue(dayRange) : [null, null];
  const sparkline = (payload.graph ?? [])
    .map((point) => point.price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price));

  return {
    id: `serpapi:${stock.toUpperCase()}${exchange ? `:${exchange.toUpperCase()}` : ""}`,
    symbol: stock.toUpperCase(),
    name: summary.title ?? stock.toUpperCase(),
    currency: (summary.currency ?? payload.graph?.find((point) => point.currency)?.currency ?? "USD").toUpperCase(),
    price: summary.extracted_price,
    marketCap: parseCompactNumber(readStat(stats, "market cap")),
    volume24h: parseCompactNumber(readStat(stats, "avg. volume") ?? readStat(stats, "volume")),
    change24h: signedPercentage(summary.price_movement?.percentage, summary.price_movement?.movement),
    high24h,
    low24h,
    updatedAt: parseDate(summary.date),
    sparkline
  };
}

function parseDate(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function serpapiWindow(range: PriceRange): string {
  if (range === "1d") {
    return "1D";
  }

  if (range === "30d") {
    return "1M";
  }

  return "5D";
}

function signedPercentage(value: number | undefined, movement: string | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return movement?.toLowerCase() === "down" ? -Math.abs(value) : value;
}

function readStat(stats: Array<{ label?: string; value?: string }>, label: string): string | null {
  const normalizedLabel = label.toLowerCase();
  const stat = stats.find((item) => item.label?.toLowerCase() === normalizedLabel);

  return stat?.value ?? null;
}

function parseRangeValue(value: string): [number | null, number | null] {
  const [low, high] = value.split(/\s+-\s+/, 2).map(parseCompactNumber);

  return [low ?? null, high ?? null];
}

function parseCompactNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replaceAll(",", "").replace(/^[^\d.-]+/, "").trim();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)([KMBT])?/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const multiplier = compactMultiplier(match[2]);
  return amount * multiplier;
}

function compactMultiplier(suffix: string | undefined): number {
  switch (suffix?.toUpperCase()) {
    case "K":
      return 1_000;
    case "M":
      return 1_000_000;
    case "B":
      return 1_000_000_000;
    case "T":
      return 1_000_000_000_000;
    default:
      return 1;
  }
}

function configuredValue(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
