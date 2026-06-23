export type Asset = {
  id: string;
  symbol: string;
  name: string;
  ethereum?: {
    contractAddress?: `0x${string}`;
    decimals: number;
    native?: boolean;
  };
};

export const assets: Asset[] = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
  { id: "ethereum", symbol: "eth", name: "Ethereum", ethereum: { decimals: 18, native: true } },
  { id: "solana", symbol: "sol", name: "Solana" },
  { id: "ripple", symbol: "xrp", name: "XRP" },
  { id: "binancecoin", symbol: "bnb", name: "BNB" },
  { id: "cardano", symbol: "ada", name: "Cardano" },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin" },
  { id: "polkadot", symbol: "dot", name: "Polkadot" },
  {
    id: "chainlink",
    symbol: "link",
    name: "Chainlink",
    ethereum: {
      contractAddress: "0x514910771af9ca656af840dff83e8264ecf986ca",
      decimals: 18
    }
  },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche" },
  { id: "the-open-network", symbol: "ton", name: "Toncoin" },
  {
    id: "usd-coin",
    symbol: "usdc",
    name: "USDC",
    ethereum: {
      contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      decimals: 6
    }
  },
  {
    id: "tether",
    symbol: "usdt",
    name: "Tether",
    ethereum: {
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      decimals: 6
    }
  }
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

export function parseAssetList(input: string): {
  assets: Asset[];
  unknown: string[];
} {
  const selectedAssets: Asset[] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];

  for (const token of input.split(",")) {
    const assetInput = token.trim();

    if (!assetInput) {
      continue;
    }

    const asset = findAsset(assetInput);
    if (!asset) {
      unknown.push(assetInput);
      continue;
    }

    if (!seen.has(asset.id)) {
      selectedAssets.push(asset);
      seen.add(asset.id);
    }
  }

  return { assets: selectedAssets, unknown };
}
