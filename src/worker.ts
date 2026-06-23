import { assets, findAsset, parseAssetList, type Asset } from "./assets.js";
import {
  getLeadingIndicators,
  getPrices,
  getTrendingCoins,
  type LeadingIndicators,
  type MarketPrice,
  type PriceRange,
  type PriceEnv,
  type SocialSentiment,
  type StablecoinFlow
} from "./coingecko.js";
import { getEthereumWalletHoldings, isEthereumAddress, type WalletEnv } from "./ethereum-wallet.js";
import {
  renderAssetPlain,
  renderAssetTerminal,
  renderComparePlain,
  renderCompareTerminal,
  renderHelpPlain,
  renderHelpTerminal,
  renderInstallSnippet,
  renderPlain,
  renderPortfolioPlain,
  renderPortfolioTerminal,
  renderTerminal,
  renderTrendingPlain,
  renderTrendingTerminal,
  type PortfolioPosition,
  type PortfolioSummary,
  type RenderOptions
} from "./render.js";

type Env = PriceEnv & WalletEnv;
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

  if (url.pathname === "/install") {
    return new Response(`${renderInstallSnippet(originBaseUrl(url))}\n`, { headers: textHeaders() });
  }

  const rangeResult = parseRange(url.searchParams.get("range"));
  if (rangeResult.error) {
    return json({ error: rangeResult.error }, 400);
  }
  const range = rangeResult.range;

  if (url.pathname === "/trending") {
    const trending = await getTrendingCoins({ env });

    if (url.searchParams.get("format") === "json" || wantsJson(request)) {
      return json({ source: "CoinGecko", trending });
    }

    const body = wantsAnsi(request) && url.searchParams.get("color") !== "never"
      ? renderTrendingTerminal(trending)
      : renderTrendingPlain(trending);
    return new Response(`${body}\n`, { headers: textHeaders() });
  }

  if (url.pathname === "/feed.txt" || url.pathname === "/rss.xml") {
    const currency = url.searchParams.get("currency") ?? "usd";
    const watchlistResult = resolveWatchlist(url.searchParams.get("assets"), undefined);
    if (watchlistResult.error) {
      return json({ error: watchlistResult.error }, 400);
    }

    const { prices, cacheStatus } = await getPrices({
      requestedAssets: watchlistResult.assets,
      currency,
      range,
      env
    });

    if (url.pathname === "/rss.xml") {
      return new Response(renderRssFeed(prices, url), {
        headers: {
          "content-type": "application/rss+xml; charset=utf-8",
          "cache-control": "public, max-age=15"
        }
      });
    }

    return new Response(`${renderTextFeed(prices, cacheStatus, range)}\n`, { headers: textHeaders() });
  }

  const compareAssetsResult = resolveCompareAssets(url.pathname);
  if (compareAssetsResult.error) {
    return json({ error: compareAssetsResult.error }, 400);
  }
  if (compareAssetsResult.assets) {
    const currency = url.searchParams.get("currency") ?? "usd";
    const { prices, cacheStatus } = await getPrices({
      requestedAssets: compareAssetsResult.assets,
      currency,
      range,
      env
    });
    const renderOptions: RenderOptions = {
      ansi: wantsAnsi(request) && url.searchParams.get("color") !== "never",
      cacheTtlMs: env.CACHE_TTL_MS,
      cacheStatus,
      charset: url.searchParams.get("charset") === "ascii" ? "ascii" : "unicode",
      range
    };

    if (url.searchParams.get("format") === "json" || wantsJson(request)) {
      return json({ currency: currency.toUpperCase(), cacheStatus, range, prices });
    }

    const body = renderOptions.ansi
      ? renderCompareTerminal(prices, renderOptions)
      : renderComparePlain(prices, renderOptions);
    return new Response(`${body}\n`, { headers: textHeaders() });
  }

  if (url.pathname === "/api/prices") {
    const currency = url.searchParams.get("currency") ?? "usd";
    const walletResult = await resolveWalletHoldings(url, env);
    if (walletResult.error) {
      return json({ error: walletResult.error }, walletResult.status ?? 400);
    }

    const holdingsResult = walletResult.holdings
      ? { holdings: walletResult.holdings }
      : parseHoldings(url.searchParams.get("holdings"));
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
      range,
      env
    });
    const portfolio = holdingsResult.holdings
      ? buildPortfolio(prices, holdingsResult.holdings, currency, walletResult.portfolioMeta)
      : undefined;

    return json({
      currency: currency.toUpperCase(),
      cacheStatus,
      range,
      prices,
      ...(walletResult.wallet ? { wallet: walletResult.wallet } : {}),
      ...(portfolio ? { portfolio } : {})
    });
  }

  const walletAddress = pathWalletAddress(url.pathname);
  if (walletAddress !== undefined) {
    url.searchParams.set("address", walletAddress);
  }

  const assetParam = walletAddress === undefined ? pathAsset(url.pathname) : undefined;
  const asset = assetParam ? findAsset(assetParam) : undefined;

  if (assetParam && !asset) {
    return new Response(`Unknown asset: ${assetParam}\nTry /btc, /eth, /sol, /help, or /api/assets\n`, {
      status: 404,
      headers: textHeaders()
    });
  }

  const currency = url.searchParams.get("currency") ?? "usd";
  const format = url.searchParams.get("format");
  const walletResult = asset ? {} : await resolveWalletHoldings(url, env);
  if (walletResult.error) {
    return json({ error: walletResult.error }, walletResult.status ?? 400);
  }

  const holdingsResult = walletResult.holdings
    ? { holdings: walletResult.holdings }
    : parseHoldings(asset ? null : url.searchParams.get("holdings"));
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
    range,
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
    indicators,
    range
  };
  const portfolio = holdingsResult.holdings
    ? buildPortfolio(prices, holdingsResult.holdings, currency, walletResult.portfolioMeta)
    : undefined;

  if (format === "json" || wantsJson(request)) {
    return json(
      asset
        ? { ...prices[0], cacheStatus, indicators }
        : {
            currency: currency.toUpperCase(),
            cacheStatus,
            range,
            prices,
            ...(walletResult.wallet ? { wallet: walletResult.wallet } : {}),
            ...(portfolio ? { portfolio } : {})
          }
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

type PortfolioMeta = {
  label?: string;
  detail?: string;
};

type WalletResult = {
  holdings?: Holding[];
  wallet?: {
    address: string;
    chain: "ethereum";
    assetsScanned: string[];
  };
  portfolioMeta?: PortfolioMeta;
  error?: string;
  status?: number;
};

function parseRange(input: string | null): { range: PriceRange; error?: string } {
  if (!input) {
    return { range: "7d" };
  }

  if (input === "1d" || input === "7d" || input === "30d") {
    return { range: input };
  }

  return { range: "7d", error: "Invalid range. Use ?range=1d, ?range=7d, or ?range=30d" };
}

function resolveCompareAssets(pathname: string): { assets?: Asset[]; error?: string } {
  const segments = pathname.split("/").filter(Boolean);
  const compareInputs =
    segments[0] === "compare"
      ? segments.slice(1)
      : segments.length === 1 && segments[0].includes(",")
      ? segments[0].split(",")
      : undefined;

  if (!compareInputs) {
    return {};
  }

  const parsed = parseAssetList(compareInputs.join(","));
  if (parsed.unknown.length > 0) {
    return { error: `Unknown asset${parsed.unknown.length === 1 ? "" : "s"}: ${parsed.unknown.join(", ")}` };
  }

  if (parsed.assets.length < 2) {
    return { error: "Compare needs at least two assets, for example /compare/btc/eth or /btc,eth" };
  }

  return { assets: parsed.assets };
}

function renderTextFeed(
  prices: MarketPrice[],
  cacheStatus: "cached" | "fresh",
  range: PriceRange
): string {
  const lines = prices.map((price) =>
    [
      price.symbol,
      price.name,
      formatFeedMoney(price.price, price.currency),
      `24h ${formatFeedPercent(price.change24h)}`,
      `volume ${formatFeedCompact(price.volume24h)}`,
      `marketCap ${formatFeedCompact(price.marketCap)}`
    ].join(" | ")
  );

  return [
    `ascii-ticker feed | updated ${new Date().toISOString()} | range ${range} | cache ${cacheStatus}`,
    ...lines
  ].join("\n");
}

function renderRssFeed(prices: MarketPrice[], url: URL): string {
  const updatedAt = new Date().toUTCString();
  const items = prices
    .map((price) => {
      const title = `${price.symbol} ${formatFeedMoney(price.price, price.currency)} (${formatFeedPercent(price.change24h)} 24h)`;
      const description = `${price.name} price ${formatFeedMoney(price.price, price.currency)}, 24h ${formatFeedPercent(price.change24h)}, volume ${formatFeedCompact(price.volume24h)}, market cap ${formatFeedCompact(price.marketCap)}.`;

      return [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(`${url.origin}/${price.symbol.toLowerCase()}`)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(`${price.id}:${price.updatedAt}`)}</guid>`,
        `      <pubDate>${updatedAt}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>ascii-ticker prices</title>",
    `    <link>${escapeXml(url.origin)}</link>`,
    "    <description>Terminal-first crypto price feed</description>",
    `    <lastBuildDate>${updatedAt}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>"
  ].join("\n");
}

function originBaseUrl(url: URL): string {
  return url.origin === "http://localhost:8787"
    ? "http://localhost:8787"
    : "https://ascii-ticker.perezcerraluciano.workers.dev";
}

async function resolveWalletHoldings(url: URL, env: Env): Promise<WalletResult> {
  const address = url.searchParams.get("address");
  if (!address) {
    return {};
  }

  const chain = url.searchParams.get("chain") ?? "ethereum";
  if (chain !== "ethereum") {
    return { error: `Unsupported chain: ${chain}. Only ethereum is supported.`, status: 400 };
  }

  if (!isEthereumAddress(address)) {
    return { error: "Invalid Ethereum address", status: 400 };
  }

  try {
    const walletHoldings = await getEthereumWalletHoldings({ address, env });
    if (walletHoldings.length === 0) {
      return {
        error: "No supported Ethereum balances found. Currently scans ETH, USDC, USDT, and LINK.",
        status: 404
      };
    }

    const holdings = walletHoldings.map((holding) => ({
      asset: holding.asset,
      amount: holding.amount
    }));

    return {
      holdings,
      wallet: {
        address,
        chain: "ethereum",
        assetsScanned: assets
          .filter((asset) => asset.ethereum)
          .map((asset) => asset.symbol)
      },
      portfolioMeta: {
        label: "ethereum wallet",
        detail: `${shortAddress(address)} | ${holdings.length} priced balance${holdings.length === 1 ? "" : "s"} found`
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ethereum wallet lookup failed";
    const status = message.includes("ETHEREUM_RPC_URL") ? 503 : 502;
    return { error: message, status };
  }
}

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

function buildPortfolio(
  prices: MarketPrice[],
  holdings: Holding[],
  currency: string,
  meta: PortfolioMeta = {}
): PortfolioSummary {
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
    positions,
    ...meta
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

function pathWalletAddress(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "wallet") {
    return undefined;
  }

  return segments[1] ?? "";
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

function formatFeedMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1 ? 2 : 8
  }).format(value);
}

function formatFeedPercent(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatFeedCompact(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
