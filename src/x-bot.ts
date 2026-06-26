import { findAsset } from "./assets.js";
import { getPrices, type MarketPrice } from "./coingecko.js";

export type XBotEnv = {
  X_BEARER_TOKEN: string;
  X_CONSUMER_KEY: string;
  X_CONSUMER_SECRET: string;
  X_ACCESS_TOKEN: string;
  X_ACCESS_TOKEN_SECRET: string;
  X_BOT_USER_ID: string;
};

export async function handleWebhook(request: Request, env: XBotEnv): Promise<Response> {
  if (request.method === "GET") {
    return handleCrc(request, env);
  }
  if (request.method === "POST") {
    return handleEvent(request, env);
  }
  return new Response("Method not allowed", { status: 405 });
}

async function handleCrc(request: Request, env: XBotEnv): Promise<Response> {
  const url = new URL(request.url);
  const crcToken = url.searchParams.get("crc_token");
  if (!crcToken) {
    return new Response("Missing crc_token", { status: 400 });
  }
  const responseToken = await computeCrcResponse(crcToken, env.X_CONSUMER_SECRET);
  return Response.json({ response_token: responseToken });
}

async function computeCrcResponse(crcToken: string, consumerSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(consumerSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(crcToken));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `sha256=${base64}`;
}

async function verifySignature(body: string, header: string, consumerSecret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(consumerSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = `sha256=${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
  return expected === header;
}

async function handleEvent(request: Request, env: XBotEnv): Promise<Response> {
  const signature = request.headers.get("x-twitter-webhooks-signature");
  const body = await request.text();

  if (signature) {
    const valid = await verifySignature(body, signature, env.X_CONSUMER_SECRET);
    if (!valid) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = (payload.tweet_create_events ?? []) as TweetEvent[];
  const botUserId = env.X_BOT_USER_ID;

  for (const event of events) {
    if (!event.text) continue;

    const mentions = event.entities?.user_mentions ?? [];
    const isBotMention = mentions.some((m) => m.id_str === botUserId);
    if (!isBotMention) continue;

    if (event.user?.id_str === botUserId) continue;

    const tweetId = event.id_str;
    const screenName = event.user?.screen_name;
    const assetInput = extractAsset(event.text);
    if (!assetInput) continue;

    try {
      await processMention(assetInput, tweetId, screenName, env);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await postReply(`@${screenName} Error: ${msg}`, tweetId, env).catch(() => {});
    }
  }

  return new Response("OK", { status: 200 });
}

type TweetEvent = {
  id_str: string;
  text: string;
  user?: {
    id_str: string;
    screen_name: string;
  };
  entities?: {
    user_mentions?: Array<{
      id_str: string;
      screen_name: string;
    }>;
  };
};

function extractAsset(text: string): string | undefined {
  const cleaned = text.replace(/@\w+/g, "").trim();
  const word = cleaned.split(/\s+/)[0]?.toLowerCase().trim();
  if (!word) return undefined;
  const asset = findAsset(word);
  return asset ? asset.symbol : undefined;
}

async function processMention(
  symbol: string,
  tweetId: string,
  screenName: string | undefined,
  env: XBotEnv
): Promise<void> {
  const asset = findAsset(symbol);
  if (!asset) return;

  const { prices, cacheStatus } = await getPrices({ requestedAssets: [asset], env: env as any });
  if (prices.length === 0) {
    await postReply(`@${screenName} No price data for ${symbol.toUpperCase()}`, tweetId, env);
    return;
  }

  const price = prices[0];
  const text = `@${screenName} ${formatReply(price)}`;
  await postReply(text, tweetId, env);
}

function formatReply(price: MarketPrice): string {
  const priceStr = formatPrice(price.price, price.currency);
  const changeStr = price.change24h !== null
    ? `${price.change24h >= 0 ? "+" : ""}${price.change24h.toFixed(2)}%`
    : "N/A";
  const volStr = price.volume24h !== null ? formatCompact(price.volume24h) : "N/A";
  const mcapStr = price.marketCap !== null ? formatCompact(price.marketCap) : "N/A";

  return [
    `${price.symbol.toUpperCase()}  ${priceStr}  (${changeStr})`,
    `Vol: ${volStr}  MCap: ${mcapStr}`
  ].join("\n");
}

function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1 ? 2 : 8
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

async function postReply(text: string, replyToId: string, env: XBotEnv): Promise<void> {
  const url = "https://api.x.com/2/tweets";
  const body = JSON.stringify({
    text,
    reply: { in_reply_to_tweet_id: replyToId }
  });

  const authHeader = await signOAuth1(
    "POST",
    url,
    {},
    env.X_CONSUMER_KEY,
    env.X_CONSUMER_SECRET,
    env.X_ACCESS_TOKEN,
    env.X_ACCESS_TOKEN_SECRET
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json"
    },
    body
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`X API ${response.status}: ${errBody}`);
  }
}

async function signOAuth1(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0"
  };

  const allParams = { ...oauthParams, ...params };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(allParams[k])}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    encodeRFC3986(baseUrl),
    encodeRFC3986(paramString)
  ].join("&");

  const signingKey = `${encodeRFC3986(consumerSecret)}&${encodeRFC3986(tokenSecret)}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signatureBase));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  oauthParams.oauth_signature = sigBase64;

  const headerParts = Object.entries(oauthParams).map(
    ([k, v]) => `${encodeRFC3986(k)}="${encodeRFC3986(v)}"`
  );

  return `OAuth ${headerParts.join(", ")}`;
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
