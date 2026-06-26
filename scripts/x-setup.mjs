#!/usr/bin/env node
import { createHmac, randomBytes } from "node:crypto";

const required = [
  "X_BEARER_TOKEN",
  "X_CONSUMER_KEY",
  "X_CONSUMER_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`❌ Missing ${name} in environment`);
    process.exit(1);
  }
}

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
const X_CONSUMER_KEY = process.env.X_CONSUMER_KEY;
const X_CONSUMER_SECRET = process.env.X_CONSUMER_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

const WEBHOOK_URL = "https://ascii-ticker.perezcerraluciano.workers.dev/x-webhook";

async function main() {
  console.log("=== Registering webhook ===");
  const webhook = await registerWebhook();
  const webhookId = webhook.data.id;
  console.log(`Webhook ID: ${webhookId}`);

  console.log("\n=== Subscribing bot account ===");
  const sub = await subscribe(webhookId);
  console.log(`Subscribed: ${sub.data.subscribed}`);

  console.log("\n=== Verifying subscription ===");
  const check = await checkSubscription(webhookId);
  console.log(`Status: ${check.data.subscribed ? "ACTIVE" : "INACTIVE"}`);

  console.log("\n✅ Done! Bot is now listening for @mentions at:");
  console.log(`   ${WEBHOOK_URL}`);
}

async function registerWebhook() {
  const res = await fetch("https://api.x.com/2/webhooks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${X_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: WEBHOOK_URL }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.title === "DuplicateUrlFailed" || body.title === "Invalid Request") {
      console.log("Webhook already registered, fetching existing...");
      return getExistingWebhook();
    }
    throw new Error(`Registration failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getExistingWebhook() {
  const res = await fetch("https://api.x.com/2/webhooks", {
    headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`List failed: ${JSON.stringify(body)}`);
  if (!body.data?.length) throw new Error("No webhooks found");
  return { data: body.data[0] };
}

async function subscribe(webhookId) {
  const url = `https://api.x.com/2/account_activity/webhooks/${webhookId}/subscriptions/all`;
  const authHeader = signOAuth1("POST", url, {}, X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader },
  });
  const body = await res.json();
  if (!res.ok && body.title !== "DuplicateSubscriptionFailed") {
    throw new Error(`Subscription failed: ${JSON.stringify(body)}`);
  }
  return { data: { subscribed: true } };
}

async function checkSubscription(webhookId) {
  const url = `https://api.x.com/2/account_activity/webhooks/${webhookId}/subscriptions/all`;
  const authHeader = signOAuth1("GET", url, {}, X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET);

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
  });
  const body = await res.json();
  return body;
}

function signOAuth1(method, baseUrl, params, consumerKey, consumerSecret, token, tokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };
  const allParams = { ...oauthParams, ...params };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${encode(k)}=${encode(allParams[k])}`)
    .join("&");
  const signatureBase = [method.toUpperCase(), encode(baseUrl), encode(paramString)].join("&");
  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;
  const sig = createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  oauthParams.oauth_signature = sig;
  const headerParts = Object.entries(oauthParams).map(([k, v]) => `${encode(k)}="${encode(v)}"`);
  return `OAuth ${headerParts.join(", ")}`;
}

function encode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
