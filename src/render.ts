import type { MarketPrice } from "./coingecko.js";

const reset = "\u001b[0m";
const bold = "\u001b[1m";
const dim = "\u001b[2m";
const green = "\u001b[32m";
const red = "\u001b[31m";
const cyan = "\u001b[36m";

export function renderTerminal(prices: MarketPrice[], cacheTtlMs = "30000"): string {
  const now = new Date().toISOString();
  const rows = prices.map((price) => {
    const changeColor = (price.change24h ?? 0) >= 0 ? green : red;
    const change = price.change24h === null ? "n/a" : `${price.change24h >= 0 ? "+" : ""}${price.change24h.toFixed(2)}%`;

    return [
      `${bold}${price.symbol.padEnd(5)}${reset}`,
      price.name.padEnd(14),
      formatMoney(price.price, price.currency).padStart(14),
      `${changeColor}${change.padStart(9)}${reset}`,
      formatCompact(price.volume24h).padStart(12)
    ].join("  ");
  });

  return [
    `${bold}${cyan}ascii-ticker${reset} ${dim}live crypto and digital asset prices${reset}`,
    `${dim}updated ${now} | data: CoinGecko | cache: ${cacheTtlMs}ms${reset}`,
    "",
    `${bold}ASSET${reset}  ${bold}${"NAME".padEnd(14)}${reset}  ${bold}${"PRICE".padStart(14)}${reset}  ${bold}${"24H".padStart(9)}${reset}  ${bold}${"VOLUME".padStart(12)}${reset}`,
    ...rows,
    "",
    `${dim}try: curl localhost:8787/btc | curl localhost:8787/eth?format=json | curl localhost:8787/api/prices${reset}`
  ].join("\n");
}

export function renderPlain(prices: MarketPrice[]): string {
  return stripAnsi(renderTerminal(prices));
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

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
