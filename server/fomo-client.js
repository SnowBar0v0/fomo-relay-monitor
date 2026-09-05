"use strict";

const DEFAULT_API_BASE = "https://prod-api.fomo.family";
const DEFAULT_AUTH_BASE = "https://auth.privy.io";
const DEFAULT_SUPPORTED_CHAINS = "1,56,143,4663,8453,1399811149";

function toText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function unwrapResponseObject(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, "responseObject")) {
    return payload.responseObject;
  }
  return payload || {};
}

function jwtExpiry(token) {
  try {
    var parts = String(token || "").split(".");
    if (parts.length < 2) return 0;
    var encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    encoded += "=".repeat((4 - encoded.length % 4) % 4);
    var payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return Number(payload.exp) || 0;
  } catch (error) {
    return 0;
  }
}

function responseHeaders(response) {
  var result = {};
  if (response && response.headers && typeof response.headers.forEach === "function") {
    response.headers.forEach(function (value, key) { result[String(key).toLowerCase()] = String(value); });
  }
  return result;
}

function tokenField(item, field) {
  var value = item || {};
  var token = value.token || value.metadata || value.currency || {};
  return value[field] || token[field] || "";
}

async function fetchJson(url, options, timeoutMs) {
  var requestOptions = Object.assign({}, options || {}, { signal: AbortSignal.timeout(timeoutMs) });
  var response = await fetch(url, requestOptions);
  var body = await response.json().catch(function () { return {}; });
  var headers = responseHeaders(response);
  if (!response.ok) {
    var error = new Error(body && (body.message || body.error || body.detail) || "FOMO API HTTP " + response.status);
    error.status = response.status;
    error.headers = headers;
    throw error;
  }
  return body;
}

class FomoClient {
  constructor(options) {
    var config = options || {};
    this.accessToken = toText(config.accessToken).trim();
    this.refreshToken = toText(config.refreshToken).trim();
    this.apiBase = toText(config.apiBase || DEFAULT_API_BASE).trim().replace(/\/+$/g, "");
    this.authBase = toText(config.authBase || DEFAULT_AUTH_BASE).trim().replace(/\/+$/g, "");
    this.supportedChains = toText(config.supportedChains || DEFAULT_SUPPORTED_CHAINS);
    this.timeoutMs = Math.max(3000, Number(config.timeoutMs) || 10000);
    this.inFlight = new Map();
    this.userCache = new Map();
    this.refreshPromise = null;
  }

  isConfigured() {
    return Boolean(this.accessToken && this.refreshToken);
  }

  async ensureAccessToken() {
    if (!this.isConfigured()) throw new Error("FOMO credentials are not configured");
    var expiry = jwtExpiry(this.accessToken);
    if (expiry && expiry - Math.floor(Date.now() / 1000) > 60) return;

    await this.refreshAccessToken();
  }

  async refreshAccessToken() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = fetchJson(this.authBase + "/api/v1/sessions", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + this.accessToken },
      body: JSON.stringify({ refresh_token: this.refreshToken })
    }, this.timeoutMs).then((body) => {
      var refreshed = body && (body.privy_access_token || body.access_token);
      if (!refreshed) throw new Error("FOMO token refresh returned no access token");
      this.accessToken = String(refreshed);
      if (body.refresh_token) this.refreshToken = String(body.refresh_token);
    }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async call(method, pathname, query, body) {
    await this.ensureAccessToken();
    var url = new URL(this.apiBase + "/" + String(pathname || "").replace(/^\/+/, ""));
    Object.entries(query || {}).forEach(function (entry) {
      if (entry[1] !== undefined && entry[1] !== null && entry[1] !== "") url.searchParams.set(entry[0], entry[1]);
    });
    var headers = {
      Accept: "application/json",
      Authorization: "Bearer " + this.accessToken,
      "X-Supported-Chains": this.supportedChains,
      Origin: "https://fomo.family",
      Referer: "https://fomo.family/"
    };
    var requestOptions = { method: method, headers: headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(body);
    }
    try {
      return unwrapResponseObject(await fetchJson(url, requestOptions, this.timeoutMs));
    } catch (error) {
      if (error.status === 401 && this.refreshToken) {
        await this.refreshAccessToken();
        headers.Authorization = "Bearer " + this.accessToken;
        return unwrapResponseObject(await fetchJson(url, requestOptions, this.timeoutMs));
      }
      throw error;
    }
  }

  deduplicated(key, operation) {
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    var promise = Promise.resolve().then(operation).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  resolveUser(handle) {
    var normalized = toText(handle).trim().replace(/^@/, "");
    if (!normalized) return Promise.resolve(null);
    var cacheKey = normalized.toLowerCase();
    var cached = this.userCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.user);
    return this.deduplicated("user:" + normalized.toLowerCase(), async () => {
      var user = await this.call("GET", "/v2/users/userHandle/" + encodeURIComponent(normalized));
      var resolved = user && (user.id || user.userId) ? user : null;
      this.userCache.set(cacheKey, { user: resolved, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
      if (this.userCache.size > 1000) this.userCache.delete(this.userCache.keys().next().value);
      return resolved;
    });
  }

  getSwaps(userId, limit) {
    var id = toText(userId).trim();
    var boundedLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    if (!id) return Promise.resolve([]);
    return this.deduplicated("swaps:" + id + ":" + boundedLimit, async () => {
      var response = await this.call("GET", "/v2/users/" + encodeURIComponent(id) + "/swaps", { limit: boundedLimit });
      return response && Array.isArray(response.swaps) ? response.swaps : [];
    });
  }

  getTokenMetadata(address, networkId) {
    var tokenAddress = toText(address).trim();
    var chainId = toText(networkId).trim();
    if (!tokenAddress || !chainId) return Promise.resolve(null);
    return this.deduplicated("token:" + tokenAddress.toLowerCase() + ":" + chainId, async () => {
      var response = await this.call("POST", "/proxy/filterTokens", undefined, [tokenAddress + ":" + chainId]);
      var items = Array.isArray(response)
        ? response
        : response && Array.isArray(response.tokens)
          ? response.tokens
        : response && Array.isArray(response.data)
            ? response.data
            : [];
      var exact = items.find(function (item) {
        var itemAddress = toText(tokenField(item, "tokenAddress") || tokenField(item, "address")).toLowerCase();
        var itemChain = toText(tokenField(item, "networkId") || tokenField(item, "chainId"));
        return itemAddress === tokenAddress.toLowerCase() && (!itemChain || itemChain === chainId);
      });
      return exact || items[0] || null;
    });
  }
}

module.exports = { FomoClient, jwtExpiry, unwrapResponseObject };
