import { assets, type Asset } from "./assets.js";

export type WalletEnv = {
  ETHEREUM_RPC_URL?: string;
};

export type WalletHolding = {
  asset: Asset;
  amount: number;
  source: "native" | "erc20";
};

type RpcSuccess<T> = {
  jsonrpc: "2.0";
  id: number;
  result: T;
};

type RpcFailure = {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
  };
};

type RpcResponse<T> = RpcSuccess<T> | RpcFailure;

const erc20BalanceOfSelector = "70a08231";

export async function getEthereumWalletHoldings(options: {
  address: string;
  env: WalletEnv;
}): Promise<WalletHolding[]> {
  if (!isEthereumAddress(options.address)) {
    throw new Error("Invalid Ethereum address");
  }

  const rpcUrl = configuredValue(options.env.ETHEREUM_RPC_URL);
  if (!rpcUrl) {
    throw new Error("ETHEREUM_RPC_URL is not configured");
  }

  const address = options.address.toLowerCase();
  const ethereumAssets = assets.filter((asset) => asset.ethereum);
  const holdings = await Promise.all(
    ethereumAssets.map(async (asset) => {
      if (asset.ethereum?.native) {
        const balance = await rpc<string>(rpcUrl, "eth_getBalance", [address, "latest"]);
        return balanceToHolding(asset, balance, "native");
      }

      if (asset.ethereum?.contractAddress) {
        const balance = await rpc<string>(rpcUrl, "eth_call", [
          {
            to: asset.ethereum.contractAddress,
            data: `0x${erc20BalanceOfSelector}${address.slice(2).padStart(64, "0")}`
          },
          "latest"
        ]);
        return balanceToHolding(asset, balance, "erc20");
      }

      return undefined;
    })
  );

  return holdings.filter((holding): holding is WalletHolding => holding !== undefined && holding.amount > 0);
}

export function isEthereumAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`Ethereum RPC returned ${response.status}`);
  }

  const payload = (await response.json()) as RpcResponse<T>;
  if ("error" in payload) {
    throw new Error(`Ethereum RPC error ${payload.error.code}: ${payload.error.message}`);
  }

  return payload.result;
}

function balanceToHolding(
  asset: Asset,
  balanceHex: string,
  source: WalletHolding["source"]
): WalletHolding | undefined {
  const decimals = asset.ethereum?.decimals;
  if (decimals === undefined) {
    return undefined;
  }

  const raw = BigInt(balanceHex);
  if (raw === 0n) {
    return undefined;
  }

  return {
    asset,
    amount: formatUnits(raw, decimals),
    source
  };
}

function formatUnits(value: bigint, decimals: number): number {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return Number(whole);
  }

  const fractional = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return Number(`${whole}.${fractional}`);
}

function configuredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
