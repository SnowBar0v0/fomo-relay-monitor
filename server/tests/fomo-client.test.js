const assert = require("node:assert/strict");
const test = require("node:test");
const { FomoClient, jwtExpiry, unwrapResponseObject } = require("../fomo-client.js");

function jwtWithExpiry(exp) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return ["header", payload, "signature"].join(".");
}

test("unwraps FOMO responseObject and reads JWT expiry", () => {
  assert.deepEqual(unwrapResponseObject({ responseObject: { id: "user-1" } }), { id: "user-1" });
  assert.equal(jwtExpiry(jwtWithExpiry(1893456000)), 1893456000);
});

test("calls user, swaps, and token endpoints without persisting credentials", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async function (url, options) {
    calls.push({ url: String(url), options: options });
    const pathname = new URL(url).pathname;
    let body = {};
    if (pathname.includes("userHandle")) body = { responseObject: { id: "user-1", userHandle: "rothstein" } };
    else if (pathname.endsWith("/swaps")) body = { responseObject: { swaps: [{ id: "swap-1" }] } };
    else body = { responseObject: [{ tokenAddress: "0xabc", networkId: 4663, symbol: "MEME" }] };
    return { ok: true, status: 200, headers: { forEach() {} }, json: async () => body };
  };

  try {
    const client = new FomoClient({
      accessToken: jwtWithExpiry(Math.floor(Date.now() / 1000) + 3600),
      refreshToken: "refresh-secret",
      apiBase: "https://fomo.test"
    });
    assert.equal((await client.resolveUser("rothstein")).id, "user-1");
    assert.equal((await client.getSwaps("user-1", 50)).length, 1);
    assert.equal((await client.getTokenMetadata("0xabc", 4663)).symbol, "MEME");
    assert.equal(calls.length, 3);
    assert.equal(calls[0].options.headers.Authorization.startsWith("Bearer header."), true);
    assert.equal(calls[2].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[2].options.body), ["0xabc:4663"]);
  } finally {
    global.fetch = originalFetch;
  }
});
