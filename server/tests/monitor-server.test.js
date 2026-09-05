const assert = require("node:assert/strict");
const test = require("node:test");
const {
  extractAddresses,
  extractFomoHandles,
  extractHashes,
  extractTelegramMessage,
  fomoHumanAmount,
  hasRelayHint,
  isFomoRelayPurchase,
  normalizeFomoSwap,
  parseTelegramRemark,
  selectRequestForMessage
} = require("../monitor-server.js");

test("extracts Relay transaction hashes from Telegram text", () => {
  const solana = "Relay fill https://solscan.io/tx/5XH4R2fBtQg5fGFtuAX5PZwwxZtWt1kYFbUYimcUF2jtd4dwqAMV8faW1w2u8o8KDHMqTkyJTVBucayMARXYBKpP";
  const evm = "relay 0x4212696cc58ee4288134098c2490c002cee15f79928ec84375b7a0b8550a43c6";
  assert.equal(extractHashes(solana).length, 1);
  assert.equal(extractHashes(evm)[0], "0x4212696cc58ee4288134098c2490c002cee15f79928ec84375b7a0b8550a43c6");
  assert.equal(extractHashes("https://relay.link/transaction/0x4212696cc58ee4288134098c2490c002cee15f79928ec84375b7a0b8550a43c6").length, 1);
  assert.equal(extractHashes("To: Relay.link", ["https://solscan.io/tx/5XH4R2fBtQg5fGFtuAX5PZwwxZtWt1kYFbUYimcUF2jtd4dwqAMV8faW1w2u8o8KDHMqTkyJTVBucayMARXYBKpP"])[0], "5XH4R2fBtQg5fGFtuAX5PZwwxZtWt1kYFbUYimcUF2jtd4dwqAMV8faW1w2u8o8KDHMqTkyJTVBucayMARXYBKpP");
});

test("only treats messages mentioning Relay as triggers", () => {
  assert.equal(hasRelayHint("To: Relay.link"), true);
  assert.equal(hasRelayHint("ordinary swap"), false);
});

test("normalizes Telegram channel and group messages", () => {
  const message = extractTelegramMessage({ update_id: 7, channel_post: { message_id: 8, chat: { id: -1001, title: "FOMO Feed" }, text: "Relay success", date: 1788490774 } });
  assert.deepEqual(message, { id: "8", chatId: "-1001", chatTitle: "FOMO Feed", chatType: "", senderName: "", text: "Relay success", urls: [], remark: "", date: "2026-09-04T02:59:34.000Z" });
  const group = extractTelegramMessage({ message: { message_id: 9, chat: { id: -1002, title: "FOMO Group" }, from: { username: "trader" }, text: "Relay pending", date: 1788490774 } });
  assert.equal(group.senderName, "trader");
  assert.equal(group.chatTitle, "FOMO Group");
});

test("reads hidden Telegram links and keeps the source remark", () => {
  const wallet = "6Js7mMJGXn6ryTbTN1ACYWNg4t1xSY1DqYzSwm1B94X";
  const tx = "2D3JuCF5y8ApYdVx2K8J9JZ2NwEw8g9XQf6bW6xW8cYf7aR2yG4nT5pQ6sV7uW8xY9zA";
  const text = "[ fomosol 组的 内幕哥rothstein 6JS7 ]\n🔴 - 137.2328 USDC\nTo: Relay.link\nBy Alertdog | Solscan";
  const message = extractTelegramMessage({ channel_post: {
    message_id: 11,
    chat: { id: -1001, title: "Relay Monitor Feed", type: "channel" },
    text,
    entities: [
      { type: "text_link", offset: text.indexOf("内幕哥"), length: "内幕哥rothstein 6JS7".length, url: "https://solscan.io/address/" + wallet },
      { type: "text_link", offset: text.indexOf("Solscan"), length: 7, url: "https://solscan.io/tx/" + tx }
    ],
    date: 1788496978
  } });
  assert.equal(message.remark, "内幕哥rothstein 6JS7");
  assert.deepEqual(message.urls, ["https://solscan.io/address/" + wallet, "https://solscan.io/tx/" + tx]);
  assert.deepEqual(extractAddresses(message.text, message.urls), [wallet]);
  assert.deepEqual(extractHashes(message.text, message.urls), [tx]);
  assert.equal(hasRelayHint(message.text, message.urls), true);
  assert.equal(parseTelegramRemark(text), "内幕哥rothstein 6JS7");
});

test("extracts explicit wallet addresses only as a bounded fallback", () => {
  const text = "Relay route CpKuhcFHogvrq7Fx3enu57xTRkh1WyzER1TVVBimC5mo 0x44fbe0006661d6d17188f1f6d42b32b5577179f7";
  assert.deepEqual(extractAddresses(text), [
    "0x44fbe0006661d6d17188f1f6d42b32b5577179f7",
    "CpKuhcFHogvrq7Fx3enu57xTRkh1WyzER1TVVBimC5mo"
  ]);
});

test("matches one Relay order to the Telegram post timestamp", () => {
  const message = { date: "2026-09-04T05:42:58.000Z" };
  const match = selectRequestForMessage([
    { id: "old", createdAt: "2026-09-04T05:27:29.000Z" },
    { id: "target", createdAt: "2026-09-04T05:42:59.119Z" },
    { id: "newer", createdAt: "2026-09-04T05:49:30.450Z" }
  ], message);
  assert.equal(match.id, "target");
  assert.equal(selectRequestForMessage([{ id: "too-old", createdAt: "2026-09-04T00:00:00.000Z" }], message), null);
});

test("extracts explicit FOMO handles from labels and hidden profile links", () => {
  assert.deepEqual(extractFomoHandles("FOMO用户: @rothstein", []), ["rothstein"]);
  assert.deepEqual(extractFomoHandles("[ fomosol 组的 @rothstein ]", []), ["rothstein"]);
  assert.deepEqual(extractFomoHandles("Relay buy", ["https://fomo.family/profile/rothstein"]), ["rothstein"]);
  assert.deepEqual(extractFomoHandles("userHandle=rothstein", []), ["rothstein"]);
  assert.deepEqual(extractFomoHandles("普通 @telegram_user", []), []);
});

test("accepts only Relay swaps that represent purchases", () => {
  assert.equal(isFomoRelayPurchase({ provider: "RELAY", inTradeId: null, outTradeId: "trade" }), true);
  assert.equal(isFomoRelayPurchase({ provider: "RELAY", inTradeId: "trade", outTradeId: null }), false);
  assert.equal(isFomoRelayPurchase({ provider: "JUPITER", inTradeId: null, outTradeId: "trade" }), false);
  assert.equal(isFomoRelayPurchase({ provider: "RELAY", side: "sell", outTokenAddress: "0x1" }), false);
});

test("normalizes a FOMO Relay swap into the read-only event contract", () => {
  const event = normalizeFomoSwap({
    id: "swap-1",
    networkId: 4663,
    inTokenAddress: "0x0000000000000000000000000000000000000000",
    outTokenAddress: "0x1111111111111111111111111111111111111111",
    inHumanAmount: 2.5,
    outHumanAmount: 2733.5,
    humanUsdAmountIn: 5,
    recipient: "0x2222222222222222222222222222222222222222",
    createdAt: "2026-09-06T00:00:00.000Z",
    provider: "RELAY"
  }, { tokenAddress: "0x1111111111111111111111111111111111111111", networkId: 4663, symbol: "MEME", name: "Meme" });
  assert.equal(event.id, "fomo:swap-1");
  assert.equal(event.output.chainName, "Robinhood Chain");
  assert.equal(event.output.symbol, "MEME");
  assert.equal(event.output.address, "0x1111111111111111111111111111111111111111");
  assert.equal(event.outputAmount, "2,733.5");
  assert.equal(event.isSuccessful, true);
  assert.equal(fomoHumanAmount(1234567.89), "1,234,567.89");
});
