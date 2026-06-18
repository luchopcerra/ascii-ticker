export type Asset = {
  id: string;
  symbol: string;
  name: string;
};

export const assets: Asset[] = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
  { id: "ethereum", symbol: "eth", name: "Ethereum" },
  { id: "solana", symbol: "sol", name: "Solana" },
  { id: "ripple", symbol: "xrp", name: "XRP" },
  { id: "binancecoin", symbol: "bnb", name: "BNB" },
  { id: "cardano", symbol: "ada", name: "Cardano" },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin" },
  { id: "polkadot", symbol: "dot", name: "Polkadot" },
  { id: "chainlink", symbol: "link", name: "Chainlink" },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche" },
  { id: "the-open-network", symbol: "ton", name: "Toncoin" },
  { id: "usd-coin", symbol: "usdc", name: "USDC" },
  { id: "tether", symbol: "usdt", name: "Tether" }
];

export function findAsset(input: string): Asset | undefined {
  const normalized = input.toLowerCase().trim();

  return assets.find(
    (asset) =>
      asset.symbol === normalized ||
      asset.id === normalized ||
      asset.name.toLowerCase() === normalized
  );
}
