import type { LeadingIndicators, MarketPrice, PriceResult, SocialSentiment, StablecoinFlow } from "./coingecko.js";

const reset = "\u001b[0m";
const bold = "\u001b[1m";
const dim = "\u001b[2m";
const green = "\u001b[32m";
const red = "\u001b[31m";
const cyan = "\u001b[36m";
const assetCardWidth = 57;

export type RenderOptions = {
  ansi?: boolean;
  cacheTtlMs?: string;
  cacheStatus?: PriceResult["cacheStatus"];
  charset?: "unicode" | "ascii";
  indicators?: LeadingIndicators;
};

export function renderTerminal(prices: MarketPrice[], options: RenderOptions = {}): string {
  const now = new Date().toISOString();
  const cacheTtlMs = options.cacheTtlMs ?? "30000";
  const cacheStatus = options.cacheStatus ?? "fresh";
  const ansi = options.ansi ?? true;
  const charset = options.charset ?? "unicode";
  const rows = prices.map((price) => {
    const changeColor = changeAnsi(price.change24h);
    const change = formatChange(price.change24h, charset);

    return [
      color(price.symbol.padEnd(5), bold, ansi),
      price.name.padEnd(14),
      formatMoney(price.price, price.currency).padStart(14),
      color(change.padStart(10), changeColor, ansi),
      formatCompact(price.volume24h).padStart(12),
      renderSparkline(price.sparkline, 18, charset)
    ].join("  ");
  });

  return [
    `${color("ascii-ticker", `${bold}${cyan}`, ansi)} ${color("terminal crypto prices", dim, ansi)}`,
    color(`updated ${now} | data: CoinGecko | cache: ${cacheStatus} (${cacheTtlMs}ms ttl)`, dim, ansi),
    "",
    [
      color("ASSET", bold, ansi),
      color("NAME".padEnd(14), bold, ansi),
      color("PRICE".padStart(14), bold, ansi),
      color("24H".padStart(10), bold, ansi),
      color("VOLUME".padStart(12), bold, ansi),
      color("7D", bold, ansi)
    ].join("  "),
    ...rows,
    "",
    color("try: curl localhost:8787/btc | curl 'localhost:8787?charset=ascii' | curl localhost:8787/eth?format=json", dim, ansi)
  ].join("\n");
}

export function renderAssetTerminal(price: MarketPrice, options: RenderOptions = {}): string {
  const ansi = options.ansi ?? true;
  const charset = options.charset ?? "unicode";
  const cacheStatus = options.cacheStatus ?? "fresh";
  const cacheTtlMs = options.cacheTtlMs ?? "30000";
  const title = `${price.symbol} / ${price.name}`;
  const line = boxChars(charset);
  const sparkline = renderSparkline(price.sparkline, 30, charset);
  const source = `CoinGecko, ${cacheStatus}, ${cacheTtlMs}ms ttl`;
  const sentimentValue = formatSentimentRow(options.indicators?.sentiment, options);
  const stablecoinValue = formatStablecoinFlowRow(options.indicators?.stablecoinFlow, options);

  return [
    `${line.topLeft}${line.horizontal} ${color(title, `${bold}${cyan}`, ansi)} ${line.horizontal.repeat(Math.max(assetCardWidth - title.length - 4, 1))}${line.topRight}`,
    boxRow("Price", formatMoney(price.price, price.currency), assetCardWidth, line, ansi),
    boxRow("24h", color(formatChange(price.change24h, charset), changeAnsi(price.change24h), ansi), assetCardWidth, line, ansi),
    boxRow("High / Low", `${formatNullableMoney(price.high24h, price.currency)} / ${formatNullableMoney(price.low24h, price.currency)}`, assetCardWidth, line, ansi),
    boxRow("Volume", formatCompact(price.volume24h), assetCardWidth, line, ansi),
    boxRow("Source", source, assetCardWidth, line, ansi),
    `${line.leftJoin}${line.horizontal.repeat(assetCardWidth)}${line.rightJoin}`,
    boxRow("7d", sparkline || "n/a", assetCardWidth, line, ansi),
    `${line.leftJoin}${line.horizontal.repeat(assetCardWidth)}${line.rightJoin}`,
    boxRow("Sentiment", sentimentValue, assetCardWidth, line, ansi),
    boxRow("Stables", stablecoinValue, assetCardWidth, line, ansi),
    `${line.bottomLeft}${line.horizontal.repeat(assetCardWidth)}${line.bottomRight}`
  ].join("\n");
}

export function renderPlain(prices: MarketPrice[], options: RenderOptions = {}): string {
  return stripAnsi(renderTerminal(prices, { ...options, ansi: false }));
}

export function renderAssetPlain(price: MarketPrice, options: RenderOptions = {}): string {
  return stripAnsi(renderAssetTerminal(price, { ...options, ansi: false }));
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1 ? 2 : 8
  }).format(value);
}

function formatCompact(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function formatNullableMoney(value: number | null, currency: string): string {
  return value === null ? "n/a" : formatMoney(value, currency);
}

function formatChange(value: number | null, charset: RenderOptions["charset"] = "unicode"): string {
  if (value === null) {
    return "n/a";
  }

  const arrow = value > 0 ? (charset === "ascii" ? "^" : "▲") : value < 0 ? (charset === "ascii" ? "v" : "▼") : "-";
  return `${arrow} ${Math.abs(value).toFixed(2)}%`;
}

function formatSentimentRow(sentiment: SocialSentiment | undefined, options: RenderOptions): string {
  const ansi = options.ansi ?? true;
  const charset = options.charset ?? "unicode";
  const label = capitalize(sentiment?.label ?? "unavailable");

  if (!sentiment || sentiment.label === "unavailable") {
    return color(label, dim, ansi);
  }

  const gauge = renderSentimentGauge(sentiment.score, charset);
  const score = sentiment.score === null ? "n/a" : `${sentiment.score >= 0 ? "+" : ""}${sentiment.score.toFixed(2)}`;
  return `${color(label, sentimentAnsi(sentiment.label), ansi)}  ${gauge} ${score}`;
}

function formatStablecoinFlowRow(flow: StablecoinFlow | undefined, options: RenderOptions): string {
  const ansi = options.ansi ?? true;
  const charset = options.charset ?? "unicode";
  const label = capitalize(flow?.label ?? "unavailable");

  if (!flow || flow.label === "unavailable") {
    return color(label, dim, ansi);
  }

  const gauge = renderFlowGauge(flow.ratio, flow.label, charset, ansi);
  const net = formatNetFlow(flow.netFlowUsd);
  return `${color(label, flowAnsi(flow.label), ansi)}  ${gauge} ${net}`;
}

function renderSparkline(values: number[], width: number, charset: RenderOptions["charset"] = "unicode"): string {
  const points = values.filter(Number.isFinite);

  if (!points.length) {
    return "";
  }

  const chars = charset === "ascii" ? "._-~=+*#%@" : "▁▂▃▄▅▆▇█";
  const sampled = sample(points, width);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);

  if (min === max) {
    return chars[0].repeat(sampled.length);
  }

  return sampled
    .map((value) => {
      const index = Math.round(((value - min) / (max - min)) * (chars.length - 1));
      return chars[index];
    })
    .join("");
}

function renderSentimentGauge(score: number | null, charset: RenderOptions["charset"] = "unicode"): string {
  if (score === null) {
    return "n/a";
  }

  const fill = charset === "ascii" ? "#" : "█";
  const empty = "-";
  const clamped = Math.min(Math.max(score, -1), 1);
  const left = clamped < 0 ? Math.round(Math.abs(clamped) * 5) : 0;
  const right = clamped > 0 ? Math.round(clamped * 5) : 0;

  return `[${fill.repeat(left)}${empty.repeat(5 - left)}|${fill.repeat(right)}${empty.repeat(5 - right)}]`;
}

function renderFlowGauge(
  ratio: number | null,
  label: StablecoinFlow["label"],
  charset: RenderOptions["charset"] = "unicode",
  ansi = true
): string {
  if (ratio === null) {
    return "n/a";
  }

  const fill = charset === "ascii" ? "#" : "█";
  const empty = "-";
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * 10);
  const gauge = `[${fill.repeat(filled)}${empty.repeat(10 - filled)}]`;
  return color(gauge, flowAnsi(label), ansi);
}

function formatNetFlow(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${value < 0 ? "-" : ""}${formatCompact(Math.abs(value))} net`;
}

function sample(values: number[], width: number): number[] {
  if (values.length <= width) {
    return values;
  }

  return Array.from({ length: width }, (_, index) => values[Math.floor((index / (width - 1)) * (values.length - 1))]);
}

function boxRow(label: string, value: string, width: number, line: BoxChars, ansi: boolean): string {
  const strippedValue = stripAnsi(value);
  const content = `${color(label.padEnd(10), bold, ansi)} ${value}`;
  const padding = " ".repeat(Math.max(width - 10 - strippedValue.length - 3, 0));
  return `${line.vertical} ${content}${padding} ${line.vertical}`;
}

type BoxChars = ReturnType<typeof boxChars>;

function boxChars(charset: RenderOptions["charset"] = "unicode") {
  if (charset === "ascii") {
    return {
      horizontal: "-",
      vertical: "|",
      topLeft: "+",
      topRight: "+",
      bottomLeft: "+",
      bottomRight: "+",
      leftJoin: "+",
      rightJoin: "+"
    };
  }

  return {
    horizontal: "─",
    vertical: "│",
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    leftJoin: "├",
    rightJoin: "┤"
  };
}

function changeAnsi(value: number | null): string {
  return (value ?? 0) >= 0 ? green : red;
}

function sentimentAnsi(label: SocialSentiment["label"]): string {
  if (label === "bullish") {
    return green;
  }

  if (label === "bearish") {
    return red;
  }

  return dim;
}

function flowAnsi(label: StablecoinFlow["label"]): string {
  if (label === "inflow") {
    return green;
  }

  if (label === "outflow") {
    return red;
  }

  return dim;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function color(value: string, code: string, ansi: boolean): string {
  return ansi ? `${code}${value}${reset}` : value;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
