import { describe, expect, it } from "vitest";
import { assets } from "../src/assets.js";
import { dispatch, jsonResponse, stubFetch } from "./worker-test-utils.js";

describe("worker route characterization", () => {
  it("returns a health payload", async () => {
    const response = await dispatch("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns the asset registry", async () => {
    const response = await dispatch("/api/assets");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ assets });
  });

  it("returns the discovery JSON payload", async () => {
    const response = await dispatch("/?format=json");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      name: "ascii-ticker",
      description: "Terminal-first market prices over HTTP",
      dataSources: {
        crypto: "CoinGecko",
        traditionalMarkets: "SerpAPI Google Finance"
      }
    });
    expect(body.examples).toEqual(
      expect.arrayContaining(["/btc", "/aapl", "/compare/btc/eth/spy"])
    );
  });

  it("returns a mocked CoinGecko-backed asset payload", async () => {
    const fetchMock = stubFetch((_request, url) => {
      if (url.pathname.endsWith("/coins/markets")) {
        return jsonResponse([
          {
            id: "bitcoin",
            symbol: "btc",
            name: "Bitcoin",
            current_price: 105000,
            market_cap: 2000000000000,
            total_volume: 42000000000,
            price_change_percentage_24h: 3.5,
            high_24h: 106000,
            low_24h: 101000,
            last_updated: "2026-06-29T12:00:00.000Z",
            sparkline_in_7d: {
              price: [100000, 103000, 105000]
            }
          }
        ]);
      }

      throw new Error(`Unhandled fetch in test: ${url.toString()}`);
    });

    const response = await dispatch("/btc?format=json");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      currency: "USD",
      price: 105000,
      cacheStatus: "fresh",
      indicators: {
        sentiment: {
          label: "bullish",
          source: "CoinGecko price proxy"
        },
        stablecoinFlow: {
          label: "inflow",
          source: "CoinGecko volume proxy"
        }
      }
    });
    expect(body.sparkline).toEqual([100000, 103000, 105000]);
  });
});
