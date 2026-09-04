const assert = require("node:assert/strict");
const test = require("node:test");
const RelayViewer = require("../../extension/relay-core.js");

function requestWith(status, outputAmount = "642540690931264134194700") {
  return {
    id: "order-1",
    status,
    createdAt: "2026-09-04T03:31:14.238Z",
    data: {
      metadata: {
        currencyIn: {
          currency: { chainId: 792703809, address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 },
          amount: "5000000000",
          amountFormatted: "5000.0"
        },
        currencyOut: {
          currency: { chainId: 4663, address: "0xab093def657f15df31b33922a95e047add645b29", symbol: "SHROOM", name: "MUSHROOM", decimals: 18 },
          amount: outputAmount,
          amountFormatted: "642540.6909312641341947"
        }
      },
      outTxs: [{ hash: "0xfill", chainId: 4663, status: "success" }]
    }
  };
}

test("normalizes a successful purchase with actual output token", () => {
  const item = RelayViewer.normalizeRequest(requestWith("success"));
  assert.equal(item.isSuccessful, true);
  assert.equal(item.isRefund, false);
  assert.equal(item.isPurchase, true);
  assert.equal(item.output.symbol, "SHROOM");
  assert.equal(item.output.chainName, "Robinhood Chain");
  assert.equal(item.outputAmount, "642,540.6909312641341947");
  assert.equal(RelayViewer.txUrl(item.outTxs[0]), "https://8crv4vmq6tiu1yqr.blockscout.com/tx/0xfill");
});

test("does not classify a refund quote as a purchase", () => {
  const item = RelayViewer.normalizeRequest(requestWith("refund"));
  assert.equal(item.isSuccessful, false);
  assert.equal(item.isRefund, true);
  assert.equal(item.statusLabel, "已退款");
});

test("distinguishes a token purchase from a token sale", () => {
  const sale = requestWith("success");
  sale.data.metadata.currencyIn = sale.data.metadata.currencyOut;
  sale.data.metadata.currencyOut = {
    currency: { chainId: 792703809, address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 },
    amount: "1000000",
    amountFormatted: "1"
  };
  assert.equal(RelayViewer.normalizeRequest(sale).isPurchase, false);
});

test("formats raw token units without floating point loss", () => {
  assert.equal(RelayViewer.formatUnits("642540690931264134194700", 18), "642,540.6909312641341947");
  assert.equal(RelayViewer.formatUnits("5000000000", 6), "5,000");
});

test("parses Relay response and deduplicates by order id", () => {
  const parsed = RelayViewer.parseResponse({ requests: [requestWith("success"), requestWith("success")] }, "v2");
  assert.equal(parsed.source, "v2");
  assert.equal(RelayViewer.uniqueById(parsed.requests).length, 1);
});

test("accepts both Solana and EVM addresses", () => {
  assert.equal(RelayViewer.isLikelyAddress("CpKuhcFHogvrq7Fx3enu57xTRkh1WyzER1TVVBimC5mo"), true);
  assert.equal(RelayViewer.isLikelyAddress("0x44fbe0006661d6d17188f1f6d42b32b5577179f7"), true);
  assert.equal(RelayViewer.isLikelyAddress("not-an-address"), false);
});

test("formats compact quantities for the monitoring table", () => {
  assert.equal(RelayViewer.compactNumber("5000"), "5K");
  assert.equal(RelayViewer.compactNumber("642540.6909312641341947"), "642.5K");
  assert.equal(RelayViewer.compactNumber("1038513.99"), "1.04M");
});

test("keeps mid-sized card quantities readable and abbreviates very large values", () => {
  assert.equal(RelayViewer.displayAmount("2733.501225410900291963"), "2,733.5");
  assert.equal(RelayViewer.displayAmount("1234567.89"), "1.23M");
});
