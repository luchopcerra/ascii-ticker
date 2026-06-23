export type Asset = {
  id: string;
  symbol: string;
  name: string;
  serpapi?: {
    ticker: string;
  };
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
  { id: "tron", symbol: "trx", name: "TRON" },
  { id: "litecoin", symbol: "ltc", name: "Litecoin" },
  { id: "shiba-inu", symbol: "shib", name: "Shiba Inu" },
  { id: "bitcoin-cash", symbol: "bch", name: "Bitcoin Cash" },
  { id: "stellar", symbol: "xlm", name: "Stellar" },
  { id: "uniswap", symbol: "uni", name: "Uniswap" },
  { id: "near", symbol: "near", name: "NEAR Protocol" },
  { id: "aptos", symbol: "apt", name: "Aptos" },
  { id: "arbitrum", symbol: "arb", name: "Arbitrum" },
  { id: "optimism", symbol: "op", name: "Optimism" },
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
  },
  { id: "apple", symbol: "aapl", name: "Apple", serpapi: { ticker: "AAPL:NASDAQ" } },
  { id: "microsoft", symbol: "msft", name: "Microsoft", serpapi: { ticker: "MSFT:NASDAQ" } },
  { id: "alphabet-a", symbol: "googl", name: "Alphabet Class A", serpapi: { ticker: "GOOGL:NASDAQ" } },
  { id: "alphabet-c", symbol: "goog", name: "Alphabet Class C", serpapi: { ticker: "GOOG:NASDAQ" } },
  { id: "amazon", symbol: "amzn", name: "Amazon", serpapi: { ticker: "AMZN:NASDAQ" } },
  { id: "nvidia", symbol: "nvda", name: "NVIDIA", serpapi: { ticker: "NVDA:NASDAQ" } },
  { id: "tesla", symbol: "tsla", name: "Tesla", serpapi: { ticker: "TSLA:NASDAQ" } },
  { id: "meta", symbol: "meta", name: "Meta Platforms", serpapi: { ticker: "META:NASDAQ" } },
  { id: "netflix", symbol: "nflx", name: "Netflix", serpapi: { ticker: "NFLX:NASDAQ" } },
  { id: "berkshire-b", symbol: "brk.b", name: "Berkshire Hathaway Class B", serpapi: { ticker: "BRK.B:NYSE" } },
  { id: "spdr-sp-500-etf", symbol: "spy", name: "SPDR S&P 500 ETF", serpapi: { ticker: "SPY:NYSEARCA" } },
  { id: "vanguard-sp-500-etf", symbol: "voo", name: "Vanguard S&P 500 ETF", serpapi: { ticker: "VOO:NYSEARCA" } },
  { id: "invesco-qqq", symbol: "qqq", name: "Invesco QQQ", serpapi: { ticker: "QQQ:NASDAQ" } },
  { id: "ishares-russell-2000", symbol: "iwm", name: "iShares Russell 2000 ETF", serpapi: { ticker: "IWM:NYSEARCA" } },
  { id: "dow-jones", symbol: "dji", name: "Dow Jones", serpapi: { ticker: ".DJI:INDEXDJX" } },
  { id: "sp-500", symbol: "spx", name: "S&P 500", serpapi: { ticker: ".INX:INDEXSP" } },
  { id: "nasdaq-composite", symbol: "ixic", name: "NASDAQ Composite", serpapi: { ticker: ".IXIC:INDEXNASDAQ" } }
];

export const cryptoAssets = assets.filter((asset) => !asset.serpapi);

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
