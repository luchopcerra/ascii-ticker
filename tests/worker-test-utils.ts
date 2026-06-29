import { afterEach, vi, type Mock } from "vitest";
import worker from "../src/worker.js";

export type WorkerTestEnv = {
  CACHE_TTL_MS: string;
  COINGECKO_API_URL: string;
  COINGECKO_API_KEY?: string;
  SENTIMENT_API_URL: string;
  SENTIMENT_API_KEY?: string;
  STABLECOIN_FLOW_API_URL: string;
  STABLECOIN_FLOW_API_KEY?: string;
  SERPAPI_API_URL: string;
  SERPAPI_API_KEY?: string;
  ETHEREUM_RPC_URL?: string;
  X_BOT_USER_ID: string;
  X_BEARER_TOKEN?: string;
  X_CONSUMER_KEY?: string;
  X_CONSUMER_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_TOKEN_SECRET?: string;
};

const defaultEnv: WorkerTestEnv = {
  CACHE_TTL_MS: "30000",
  COINGECKO_API_URL: "https://api.coingecko.com/api/v3",
  SENTIMENT_API_URL: "",
  STABLECOIN_FLOW_API_URL: "",
  SERPAPI_API_URL: "https://serpapi.com/search",
  X_BOT_USER_ID: "test-bot-user-id"
};

export function createEnv(overrides: Partial<WorkerTestEnv> = {}): WorkerTestEnv {
  return {
    ...defaultEnv,
    ...overrides
  };
}

export type FetchStubHandler = (request: Request, url: URL) => Response | Promise<Response>;

export function stubFetch(handler: FetchStubHandler): Mock<typeof fetch> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    return handler(request, new URL(request.url));
  });

  vi.stubGlobal("fetch", fetchMock as typeof fetch);

  return fetchMock;
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export async function dispatch(
  path: string,
  options: {
    env?: Partial<WorkerTestEnv>;
    headers?: HeadersInit;
    method?: string;
    body?: BodyInit | null;
  } = {}
): Promise<Response> {
  const request = new Request(`https://example.com${path}`, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body
  });

  return worker.fetch(request, createEnv(options.env));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
