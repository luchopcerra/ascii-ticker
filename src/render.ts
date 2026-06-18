import type { MarketPrice, PriceResult } from "./coingecko.js";

const reset = "\u001b[0m";
const bold = "\u001b[1m";
const dim = "\u001b[2m";
const green = "\u001b[32m";
const red = "\u001b[31m";
const cyan = "\u001b[36m";

export type RenderOptions = {
  ansi?: boolean;
  cacheTtlMs?: string;
  cacheStatus?: PriceResult["cacheStatus"];
  charset?: "unicode" | "ascii";
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
  const width = 44;
  const line = boxChars(charset);
  const sparkline = renderSparkline(price.sparkline, 30, charset);
  const source = `CoinGecko, ${cacheStatus}, ${cacheTtlMs}ms ttl`;

  return [
    `${line.topLeft}${line.horizontal} ${color(title, `${bold}${cyan}`, ansi)} ${line.horizontal.repeat(Math.max(width - title.length - 4, 1))}${line.topRight}`,
    boxRow("Price", formatMoney(price.price, price.currency), width, line, ansi),
    boxRow("24h", color(formatChange(price.change24h, charset), changeAnsi(price.change24h), ansi), width, line, ansi),
    boxRow("High / Low", `${formatNullableMoney(price.high24h, price.currency)} / ${formatNullableMoney(price.low24h, price.currency)}`, width, line, ansi),
    boxRow("Volume", formatCompact(price.volume24h), width, line, ansi),
    boxRow("Source", source, width, line, ansi),
    `${line.leftJoin}${line.horizontal.repeat(width)}${line.rightJoin}`,
    boxRow("7d", sparkline || "n/a", width, line, ansi),
    `${line.bottomLeft}${line.horizontal.repeat(width)}${line.bottomRight}`
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

function color(value: string, code: string, ansi: boolean): string {
  return ansi ? `${code}${value}${reset}` : value;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
