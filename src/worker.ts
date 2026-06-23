import { assets, findAsset, parseAssetList, type Asset } from "./assets.js";
import {
  getLeadingIndicators,
  getPrices,
  type LeadingIndicators,
  type MarketPrice,
  type PriceEnv,
  type SocialSentiment,
  type StablecoinFlow
} from "./coingecko.js";
import {
  renderAssetPlain,
  renderAssetTerminal,
  renderHelpPlain,
  renderHelpTerminal,
  renderPlain,
  renderPortfolioPlain,
  renderPortfolioTerminal,
  renderTerminal,
  type PortfolioPosition,
  type PortfolioSummary,
  type RenderOptions
} from "./render.js";

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

  if (isHelpRequest(url)) {
    const options: RenderOptions = {
      ansi: wantsAnsi(request) && url.searchParams.get("color") !== "never"
    };
    const body = `${options.ansi ? renderHelpTerminal(options) : renderHelpPlain(options)}\n`;

    return new Response(body, { headers: textHeaders() });
  }

  if (url.pathname === "/health") {
    return json({ ok: true });
  }

  if (url.pathname === "/api/assets") {
    return json({ assets });
  }

  if (url.pathname === "/api/prices") {
    const currency = url.searchParams.get("currency") ?? "usd";
    const holdingsResult = parseHoldings(url.searchParams.get("holdings"));
    if (holdingsResult.error) {
      return json({ error: holdingsResult.error }, 400);
    }

    const watchlistResult = resolveWatchlist(url.searchParams.get("assets"), holdingsResult.holdings);
    if (watchlistResult.error) {
      return json({ error: watchlistResult.error }, 400);
    }

    const { prices, cacheStatus } = await getPrices({
      requestedAssets: watchlistResult.assets,
      currency,
      env
    });
    const portfolio = holdingsResult.holdings ? buildPortfolio(prices, holdingsResult.holdings, currency) : undefined;

    return json({ currency: currency.toUpperCase(), cacheStatus, prices, ...(portfolio ? { portfolio } : {}) });
  }

  const assetParam = pathAsset(url.pathname);
  const asset = assetParam ? findAsset(assetParam) : undefined;

  if (assetParam && !asset) {
    return new Response(`Unknown asset: ${assetParam}\nTry /btc, /eth, /sol, /help, or /api/assets\n`, {
      status: 404,
      headers: textHeaders()
    });
  }

  const currency = url.searchParams.get("currency") ?? "usd";
  const format = url.searchParams.get("format");
  const holdingsResult = parseHoldings(asset ? null : url.searchParams.get("holdings"));
  if (holdingsResult.error) {
    return json({ error: holdingsResult.error }, 400);
  }

  const watchlistResult = resolveWatchlist(asset ? null : url.searchParams.get("assets"), holdingsResult.holdings);
  if (watchlistResult.error) {
    return json({ error: watchlistResult.error }, 400);
  }

  const { prices, cacheStatus } = await getPrices({
    requestedAssets: asset ? [asset] : watchlistResult.assets,
    currency,
    env
  });
  if (asset && prices.length === 0) {
    throw new Error(`CoinGecko returned no market data for ${asset.symbol.toUpperCase()}; verify the asset is supported by CoinGecko and the CoinGecko API is available`);
  }
  const indicators = asset ? withIndicatorFallbacks(prices[0], await getLeadingIndicators({ asset, env })) : undefined;
  const renderOptions: RenderOptions = {
    ansi: wantsAnsi(request) && url.searchParams.get("color") !== "never",
    cacheTtlMs: env.CACHE_TTL_MS,
    cacheStatus,
    charset: url.searchParams.get("charset") === "ascii" ? "ascii" : "unicode",
    indicators
  };
  const portfolio = holdingsResult.holdings ? buildPortfolio(prices, holdingsResult.holdings, currency) : undefined;

  if (format === "json" || wantsJson(request)) {
    return json(
      asset
        ? { ...prices[0], cacheStatus, indicators }
        : { currency: currency.toUpperCase(), cacheStatus, prices, ...(portfolio ? { portfolio } : {}) }
    );
  }

  const body = portfolio
    ? `${renderOptions.ansi ? renderPortfolioTerminal(portfolio, renderOptions) : renderPortfolioPlain(portfolio, renderOptions)}\n`
    : asset
    ? `${renderOptions.ansi ? renderAssetTerminal(prices[0], renderOptions) : renderAssetPlain(prices[0], renderOptions)}\n`
    : `${renderOptions.ansi ? renderTerminal(prices, renderOptions) : renderPlain(prices, renderOptions)}\n`;

  return new Response(body, { headers: textHeaders() });
}

type Holding = {
  asset: Asset;
  amount: number;
};

function resolveWatchlist(
  assetsParam: string | null,
  holdings: Holding[] | undefined
): { assets?: Asset[]; error?: string } {
  if (holdings) {
    return { assets: holdings.map((holding) => holding.asset) };
  }

  if (!assetsParam) {
    return {};
  }

  const parsed = parseAssetList(assetsParam);
  if (parsed.unknown.length > 0) {
    return { error: `Unknown asset${parsed.unknown.length === 1 ? "" : "s"}: ${parsed.unknown.join(", ")}` };
  }

  if (parsed.assets.length === 0) {
    return { error: "Provide at least one asset in ?assets=btc,eth" };
  }

  return { assets: parsed.assets };
}

function parseHoldings(input: string | null): { holdings?: Holding[]; error?: string } {
  if (!input) {
    return {};
  }

  const holdings = new Map<string, Holding>();

  for (const token of input.split(",")) {
    const holdingInput = token.trim();
    if (!holdingInput) {
      continue;
    }

    const separator = holdingInput.indexOf(":");
    if (separator === -1) {
      return { error: `Invalid holding "${holdingInput}". Use asset:amount, for example btc:0.25` };
    }

    const assetInput = holdingInput.slice(0, separator).trim();
    const amountInput = holdingInput.slice(separator + 1).trim();
    const asset = findAsset(assetInput);
    const amount = Number(amountInput);

    if (!asset) {
      return { error: `Unknown asset: ${assetInput}` };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: `Invalid amount for ${assetInput}: ${amountInput}` };
    }

    const existing = holdings.get(asset.id);
    holdings.set(asset.id, {
      asset,
      amount: (existing?.amount ?? 0) + amount
    });
  }

  const parsed = [...holdings.values()];
  if (parsed.length === 0) {
    return { error: "Provide at least one holding in ?holdings=btc:0.25,eth:2.1" };
  }

  return { holdings: parsed };
}

function buildPortfolio(prices: MarketPrice[], holdings: Holding[], currency: string): PortfolioSummary {
  const pricesById = new Map(prices.map((price) => [price.id, price]));
  const positions: PortfolioPosition[] = holdings.flatMap((holding) => {
    const price = pricesById.get(holding.asset.id);
    if (!price) {
      return [];
    }

    const value = holding.amount * price.price;
    const change24hValue = calculatePositionChange24h(value, price.change24h);

    return [
      {
        price,
        amount: holding.amount,
        value,
        change24hValue
      }
    ];
  });
  const totalValue = positions.reduce((total, position) => total + position.value, 0);
  const presentChanges = positions
    .map((position) => position.change24hValue)
    .filter((change): change is number => change !== null);
  const change24hValue =
    presentChanges.length === positions.length
      ? presentChanges.reduce((total, change) => total + change, 0)
      : null;
  let change24hPercent: number | null = null;
  if (change24hValue !== null) {
    const previousValue = totalValue - change24hValue;
    change24hPercent = Math.abs(previousValue) < minPriceBaseline ? null : (change24hValue / previousValue) * 100;
  }

  return {
    currency: currency.toUpperCase(),
    totalValue,
    change24hValue,
    change24hPercent,
    positions
  };
}

function calculatePositionChange24h(value: number, change24hPercent: number | null): number | null {
  if (change24hPercent === null) {
    return null;
  }

  const previousValue = value / (1 + change24hPercent / 100);

  return value - previousValue;
}

function pathAsset(pathname: string): string | undefined {
  const segment = pathname.split("/").filter(Boolean)[0];

  if (!segment || segment === "favicon.ico") {
    return undefined;
  }

  return segment;
}

function isHelpRequest(url: URL): boolean {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return (
    pathname === "/help" ||
    pathname === "/--help" ||
    pathname === "/-h" ||
    url.searchParams.has("help") ||
    url.searchParams.has("--help") ||
    url.searchParams.has("-h")
  );
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
  const tradingVelocity = calculateTradingVelocity(price);
  const normalizedChange = changeSignal === null ? null : Math.abs(changeSignal) / sentimentNormalizationFactor;
  const scaledVelocity = tradingVelocity === null ? null : tradingVelocity * stablecoinVelocityMultiplier;
  const averageRatio = averagePresent([normalizedChange, scaledVelocity]);
  const ratio = averageRatio === null ? null : clamp(averageRatio, 0, 1);
  // Volume divided by market cap acts as a simple trading-velocity proxy for flow intensity.
  // Scale volume by signed daily price change to approximate direction and magnitude of net flow.
  // `changeSignal` is a percent, so divide by 100 to convert it to a decimal multiplier.
  const netFlowUsd = price.volume24h === null || changeSignal === null ? null : price.volume24h * (changeSignal / 100);

  return {
    netFlowUsd,
    ratio,
    label: stablecoinLabel(changeSignal),
    source: "CoinGecko volume proxy",
    updatedAt: price.updatedAt
  };
}

function calculateTradingVelocity(price: MarketPrice): number | null {
  if (price.volume24h === null || price.marketCap === null || price.marketCap <= 0) {
    return null;
  }

  return price.volume24h / price.marketCap;
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

function averagePresent(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);

  if (present.length === 0) {
    return null;
  }

  return present.reduce((total, value) => total + value, 0) / present.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
