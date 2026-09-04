"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const RelayViewer = require("./relay-core.js");

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.MONITOR_DATA_DIR || path.join(process.cwd(), "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const OFFSET_FILE = path.join(DATA_DIR, "telegram-offset.json");
const DEFAULT_TELEGRAM_CHAT_IDS = "";
const RELAY_RPM = Math.max(1, Number(process.env.RELAY_RPM || 180));
const EVENT_LIMIT = 500;
const DEFAULT_MESSAGE_MATCH_WINDOW_MS = 15 * 60 * 1000;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function persistJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function sleep(milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

function parseTelegramRemark(text) {
  var source = String(text || "").replace(/\r/g, "");
  var match = source.match(/(?:组的|群的)\s*([^\[\]【】\n]+?)\s*(?:[\]】]|$)/i);
  if (match && match[1]) return match[1].trim();
  return "";
}

function addUnique(items, value) {
  var normalized = String(value || "").trim();
  if (normalized && items.indexOf(normalized) < 0) items.push(normalized);
}

function telegramEntityUrls(message, text) {
  var urls = [];
  var entities = message && (message.text ? message.entities : message.caption_entities);
  (entities || []).forEach(function (entity) {
    if (!entity) return;
    if (entity.type === "text_link" && entity.url) addUnique(urls, entity.url);
    if (entity.type === "url" && Number.isInteger(entity.offset) && Number.isInteger(entity.length)) {
      addUnique(urls, String(text || "").slice(entity.offset, entity.offset + entity.length));
    }
  });
  (String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || []).forEach(function (value) {
    addUnique(urls, value.replace(/[),.!?，。！？】》]+$/g, ""));
  });
  return urls;
}

// Node's built-in fetch does not honor HTTP(S)_PROXY on all supported versions.
function requestJson(url, headers, timeoutMs) {
  var proxyText = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || "";
  if (!proxyText) {
    return fetch(url, { headers: headers, signal: AbortSignal.timeout(timeoutMs) }).then(async function (response) {
      return { ok: response.ok, status: response.status, body: await response.json().catch(function () { return {}; }) };
    });
  }

  return new Promise(function (resolve, reject) {
    var target = new URL(url);
    var proxy;
    try { proxy = new URL(proxyText); } catch (error) { reject(error); return; }
    if (proxy.protocol !== "http:" && proxy.protocol !== "https:") {
      reject(new Error("Unsupported proxy protocol: " + proxy.protocol));
      return;
    }
    var proxyTransport = proxy.protocol === "https:" ? https : http;
    var proxyHeaders = { Host: target.hostname + ":" + (target.port || 443) };
    if (proxy.username || proxy.password) {
      proxyHeaders["Proxy-Authorization"] = "Basic " + Buffer.from(decodeURIComponent(proxy.username) + ":" + decodeURIComponent(proxy.password)).toString("base64");
    }
    var timer;
    var connectRequest = proxyTransport.request({
      hostname: proxy.hostname,
      port: proxy.port || (proxy.protocol === "https:" ? 443 : 80),
      method: "CONNECT",
      path: target.hostname + ":" + (target.port || 443),
      headers: proxyHeaders
    });
    var fail = function (error) {
      if (timer) clearTimeout(timer);
      reject(error);
    };
    timer = setTimeout(function () { connectRequest.destroy(new Error("Proxy request timeout")); }, timeoutMs);
    connectRequest.once("error", fail);
    connectRequest.once("connect", function (connectResponse, socket) {
      if (connectResponse.statusCode !== 200) {
        socket.destroy();
        fail(new Error("Proxy CONNECT HTTP " + connectResponse.statusCode));
        return;
      }
      var request = https.request({
        hostname: target.hostname,
        port: target.port || 443,
        method: "GET",
        path: target.pathname + target.search,
        headers: headers,
        socket: socket,
        agent: false,
        servername: target.hostname
      }, function (response) {
        var chunks = [];
        response.setEncoding("utf8");
        response.on("data", function (chunk) { chunks.push(chunk); });
        response.on("end", function () {
          if (timer) clearTimeout(timer);
          var body = {};
          try { body = JSON.parse(chunks.join("")); } catch (error) { body = {}; }
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, body: body });
        });
      });
      request.once("error", fail);
      request.end();
    });
    connectRequest.end();
  });
}

function extractTelegramMessage(update) {
  var message = update && (update.message || update.channel_post || update.edited_message || update.edited_channel_post);
  if (!message) return null;
  var text = String(message.text || message.caption || "");
  return {
    id: String(message.message_id || ""),
    chatId: String(message.chat && message.chat.id || ""),
    chatTitle: String(message.chat && (message.chat.title || message.chat.username || "") || ""),
    chatType: String(message.chat && message.chat.type || ""),
    senderName: String(message.from && (message.from.username || [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "") || ""),
    text: text,
    urls: telegramEntityUrls(message, text),
    remark: parseTelegramRemark(text),
    date: message.date ? new Date(Number(message.date) * 1000).toISOString() : ""
  };
}

function extractHashes(text, urls) {
  var source = [String(text || "")].concat(Array.isArray(urls) ? urls : []).join(" ");
  var result = [];
  var seen = new Set();
  var add = function (value) {
    var hash = String(value || "").trim();
    if (hash && !seen.has(hash)) { seen.add(hash); result.push(hash); }
  };
  var evmMatches = source.match(/\b0x[0-9a-f]{64}\b/gi) || [];
  evmMatches.forEach(add);
  var solanaUrlMatches = source.match(/solscan\.io\/tx\/([1-9A-HJ-NP-Za-km-z]{64,100})/gi) || [];
  solanaUrlMatches.forEach(function (value) { add(value.split("/tx/")[1]); });
  var relayUrlMatches = source.match(/relay\.link\/(?:transaction|transactions|tx)[\/?#=]+(?:request\/)?([0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{32,100})/gi) || [];
  relayUrlMatches.forEach(function (value) {
    var match = value.match(/[\/?#=]([0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{32,100})$/i);
    if (match) add(match[1]);
  });
  var explorerMatches = source.match(/(?:blockscout\.com|etherscan\.io|basescan\.org)\/tx\/(0x[0-9a-f]{64})/gi) || [];
  explorerMatches.forEach(function (value) { add(value.split("/tx/")[1]); });
  var labelled = source.match(/(?:tx|hash|交易|签名)\s*[:=：]?\s*([1-9A-HJ-NP-Za-km-z]{64,100})/i);
  if (labelled) add(labelled[1]);
  return result;
}

function extractAddresses(text, urls) {
  var source = [String(text || "")].concat(Array.isArray(urls) ? urls : []).join(" ");
  var result = [];
  var seen = new Set();
  var add = function (value) {
    var address = String(value || "").trim();
    if (address && !seen.has(address.toLowerCase())) { seen.add(address.toLowerCase()); result.push(address); }
  };
  (source.match(/\b0x[0-9a-f]{40}\b/gi) || []).forEach(add);
  (source.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || []).forEach(function (value) {
    if (!/^(?:https?|relay|solscan|blockscout)$/i.test(value)) add(value);
  });
  (Array.isArray(urls) ? urls : []).forEach(function (value) {
    try {
      var parsed = new URL(value);
      ["address", "account", "wallet", "user", "recipient"].forEach(function (key) {
        var parameter = parsed.searchParams.get(key);
        if (parameter) add(parameter);
      });
      parsed.pathname.split("/").filter(Boolean).forEach(function (part) {
        if (/^0x[0-9a-f]{40}$/i.test(part) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(part)) add(part);
      });
    } catch (error) {
      // Entity URLs can be relative or malformed; raw text extraction still applies.
    }
  });
  return result.slice(0, 3);
}

function hasRelayHint(text, urls) {
  var source = [String(text || "")].concat(Array.isArray(urls) ? urls : []).join(" ");
  return /relay(?:\.link)?|cross[- ]?chain|跨链|solscan\.io\/(?:tx|address|account)|blockscout\.com\/(?:tx|address)|etherscan\.io\/(?:tx|address)|basescan\.org\/(?:tx|address)/i.test(source);
}

function requestTimestamp(request) {
  var value = request && (request.createdAt || request.updatedAt);
  var timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function selectRequestForMessage(requests, message, matchWindowMs) {
  var items = (requests || []).filter(function (request) { return request && request.id && request.isPurchase !== false; });
  if (!items.length) return null;
  var anchor = Date.parse(message && message.date || "");
  if (!Number.isFinite(anchor)) return items[0];
  var windowMs = Number.isFinite(Number(matchWindowMs)) ? Number(matchWindowMs) : DEFAULT_MESSAGE_MATCH_WINDOW_MS;
  var ranked = items.map(function (request) {
    var timestamp = requestTimestamp(request);
    return { request: request, distance: timestamp ? Math.abs(timestamp - anchor) : Number.MAX_SAFE_INTEGER };
  }).sort(function (a, b) { return a.distance - b.distance; });
  if (!ranked.length || ranked[0].distance > windowMs) return null;
  return ranked[0].request;
}

class RelayClient {
  constructor(apiKey, requestsPerMinute) {
    this.apiKey = String(apiKey || "").trim();
    this.minimumInterval = Math.ceil(60000 / requestsPerMinute);
    this.nextAvailableAt = 0;
    this.inFlight = new Map();
  }

  async waitForSlot() {
    var now = Date.now();
    var wait = Math.max(0, this.nextAvailableAt - now);
    this.nextAvailableAt = Math.max(now, this.nextAvailableAt) + this.minimumInterval;
    if (wait) await sleep(wait);
  }

  async fetchJson(endpoint, query, useV3) {
    await this.waitForSlot();
    var url = new URL("https://api.relay.link" + endpoint);
    Object.entries(query || {}).forEach(function (entry) {
      if (entry[1] !== undefined && entry[1] !== null && entry[1] !== "") url.searchParams.set(entry[0], entry[1]);
    });
    var headers = { Accept: "application/json" };
    if (useV3 && this.apiKey) headers["x-api-key"] = this.apiKey;
    var response = await fetch(url, { headers: headers, signal: AbortSignal.timeout(10000) });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(body.message || body.error || "HTTP " + response.status);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async lookup(query) {
    var cacheKey = JSON.stringify(query || {});
    if (this.inFlight.has(cacheKey)) return this.inFlight.get(cacheKey);
    var promise = this.lookupUncached(query).finally(() => this.inFlight.delete(cacheKey));
    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  async lookupUncached(query) {
    var requestedLimit = Number(query.limit);
    var limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 50;
    var v3Query = query.hash ? { term: query.hash, limit: limit } : { user: query.address, limit: limit, sortBy: "createdAt", sortDirection: "desc" };
    if (this.apiKey) {
      try {
        var v3 = RelayViewer.parseResponse(await this.fetchJson("/requests/v3", v3Query, true), "v3");
        return { source: "v3", requests: RelayViewer.uniqueById(v3.requests), deprecation: v3.deprecation };
      } catch (error) {
        if (error.status !== 400 && error.status !== 401 && error.status !== 403 && error.status !== 404) throw error;
      }
    }
    var v2Query = query.hash ? { hash: query.hash, limit: limit } : { user: query.address, limit: limit };
    var v2 = RelayViewer.parseResponse(await this.fetchJson("/requests/v2", v2Query, false), "v2");
    return { source: "v2", requests: RelayViewer.uniqueById(v2.requests), deprecation: v2.deprecation };
  }

}

function createEvent(request, context, source) {
  var messageContext = context || {};
  var remark = messageContext.remark || request.remark || messageContext.senderName || messageContext.chatTitle || "TG消息";
  return Object.assign({}, request, {
    remark: remark,
    monitorSource: source,
    telegramChatId: messageContext.chatId || "",
    telegramMessageId: messageContext.id || "",
    telegramDate: messageContext.date || "",
    detectedAt: new Date().toISOString()
  });
}

function createStore() {
  var saved = readJson(EVENTS_FILE, []);
  var events = new Map();
  if (Array.isArray(saved)) saved.forEach(function (event) {
    // These were created by the old address fallback and may be unrelated historical orders.
    var legacyUnclassifiedHash = event && event.monitorSource === "telegram-hash" && typeof event.isPurchase === "undefined";
    if (event && event.id && event.monitorSource !== "telegram-address" && !legacyUnclassifiedHash) events.set(event.id, event);
  });
  var persistTimer = null;
  return {
    list: function (limit) {
      return Array.from(events.values()).sort(function (a, b) {
        return new Date(b.updatedAt || b.createdAt || b.detectedAt || 0) - new Date(a.updatedAt || a.createdAt || a.detectedAt || 0);
      }).slice(0, Math.max(1, Math.min(EVENT_LIMIT, Number(limit) || 100)));
    },
    upsert: function (event) {
      if (!event || !event.id) return;
      var previous = events.get(event.id) || {};
      events.set(event.id, Object.assign({}, previous, event));
      while (events.size > EVENT_LIMIT) {
        var oldest = Array.from(events.values()).sort(function (a, b) { return new Date(a.updatedAt || a.createdAt || a.detectedAt || 0) - new Date(b.updatedAt || b.createdAt || b.detectedAt || 0); })[0];
        if (!oldest) break;
        events.delete(oldest.id);
      }
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(function () { persistJson(EVENTS_FILE, Array.from(events.values())); }, 250);
    }
  };
}

async function main() {
  var store = createStore();
  var relay = new RelayClient(process.env.RELAY_API_KEY, RELAY_RPM);
  var telegramToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  var allowedChats = new Set(String(process.env.TELEGRAM_CHAT_IDS || DEFAULT_TELEGRAM_CHAT_IDS).split(/[\s,]+/).map(function (value) { return value.trim(); }).filter(Boolean));
  var offsetState = readJson(OFFSET_FILE, { offset: 0 });
  var relayRetryAttempts = Math.max(0, Math.min(8, Number(process.env.RELAY_RETRY_ATTEMPTS || 6)));
  var relayRetryBaseMs = Math.max(500, Number(process.env.RELAY_RETRY_BASE_MS || 2000));
  var addressLookupLimit = Math.max(5, Math.min(50, Number(process.env.RELAY_ADDRESS_LOOKUP_LIMIT || 50)));
  var messageMatchWindowMs = Math.max(60000, Number(process.env.RELAY_MESSAGE_MATCH_WINDOW_MS || DEFAULT_MESSAGE_MATCH_WINDOW_MS));
  var pendingHashes = new Map();
  var telegramState = {
    configured: Boolean(telegramToken),
    connected: false,
    botUsername: "",
    lastPollAt: "",
    lastUpdateAt: "",
    lastUpdateChatId: "",
    lastUpdateChatTitle: "",
    lastUpdateChatType: "",
    lastAcceptedMessageAt: "",
    lastError: "",
    chatAccessible: false,
    chatError: "",
    chatChecks: []
  };

  function ingest(response, source, messageContext) {
    (response.requests || []).filter(function (request) { return request && request.isPurchase !== false; }).forEach(function (request) {
      store.upsert(createEvent(request, messageContext, source));
    });
  }

  function retryDelay(attempt) {
    return relayRetryBaseMs * Math.pow(2, Math.max(0, attempt - 1));
  }

  function scheduleHashLookup(hash, message, attempt) {
    var key = String(hash || "").trim();
    if (!key) return;
    var previousAttempt = pendingHashes.get(key);
    if (previousAttempt !== undefined && previousAttempt >= attempt) return;
    pendingHashes.set(key, attempt);
    relay.lookup({ hash: key })
      .then(function (response) {
        ingest(response, "telegram-hash", message);
        var requests = response.requests || [];
        var waiting = !requests.length || requests.some(function (request) {
          return request.isPending || request.outcome === "unknown";
        });
        if (waiting && attempt < relayRetryAttempts) {
          setTimeout(function () { scheduleHashLookup(key, message, attempt + 1); }, retryDelay(attempt));
        } else {
          pendingHashes.delete(key);
        }
      })
      .catch(function (error) {
        console.error("Relay hash lookup failed:", error.message);
        if (attempt < relayRetryAttempts) {
          setTimeout(function () { scheduleHashLookup(key, message, attempt + 1); }, retryDelay(attempt));
        } else {
          pendingHashes.delete(key);
        }
      });
  }

  async function inspectMessage(message) {
    if (!message) return;
    var hashes = extractHashes(message.text, message.urls);
    if (!hashes.length && !hasRelayHint(message.text, message.urls)) return;

    if (hashes.length) {
      hashes.forEach(function (hash) { scheduleHashLookup(hash, message, 1); });
      return;
    }
    var addresses = extractAddresses(message.text, message.urls);
    for (var addressIndex = 0; addressIndex < addresses.length; addressIndex += 1) {
      try {
        var response = await relay.lookup({ address: addresses[addressIndex], limit: addressLookupLimit });
        var request = selectRequestForMessage(response.requests || [], message, messageMatchWindowMs);
        if (request) ingest({ requests: [request] }, "telegram-address-match", message);
        else console.warn("No Relay order matched Telegram message time for address " + addresses[addressIndex]);
      } catch (error) { console.error("Relay address lookup failed:", error.message); }
    }
  }

  async function telegramCall(method, parameters) {
    var url = "https://api.telegram.org/bot" + telegramToken + "/" + method;
    var search = new URLSearchParams();
    Object.entries(parameters || {}).forEach(function (entry) { search.set(entry[0], typeof entry[1] === "string" ? entry[1] : JSON.stringify(entry[1])); });
    var response = await requestJson(url + "?" + search.toString(), { Accept: "application/json" }, 35000);
    var body = response.body || {};
    if (!response.ok || !body.ok) {
      var error = new Error(body.description || "Telegram API HTTP " + response.status);
      error.status = response.status;
      throw error;
    }
    return body.result;
  }

  async function verifyTelegramAccess() {
    if (!telegramToken) return false;
    try {
      var bot = await telegramCall("getMe");
      telegramState.connected = true;
      telegramState.botUsername = bot && bot.username ? String(bot.username) : "";
      telegramState.lastError = "";
      telegramState.chatChecks = [];
      telegramState.chatError = "";
      var chatIds = Array.from(allowedChats);
      for (var index = 0; index < chatIds.length; index += 1) {
        var chatId = chatIds[index];
        try {
          var chat = await telegramCall("getChat", { chat_id: chatId });
          var member = await telegramCall("getChatMember", { chat_id: chatId, user_id: bot.id });
          var memberStatus = member && member.status ? String(member.status) : "unknown";
          var memberOk = ["creator", "administrator", "member"].indexOf(memberStatus) >= 0;
          telegramState.chatChecks.push({ id: chatId, ok: memberOk, title: chat && (chat.title || chat.username || "") || "", type: chat && chat.type || "", memberStatus: memberStatus, error: memberOk ? "" : "Bot 不在该聊天中或已被移除" });
        } catch (error) {
          telegramState.chatChecks.push({ id: chatId, ok: false, error: error.message });
        }
      }
      telegramState.chatAccessible = telegramState.chatChecks.length > 0 && telegramState.chatChecks.every(function (check) { return check.ok; });
      telegramState.chatError = telegramState.chatChecks.filter(function (check) { return !check.ok; }).map(function (check) { return check.id + ": " + check.error; }).join("; ");
      return true;
    } catch (error) {
      telegramState.connected = false;
      telegramState.lastError = error.message;
      return false;
    }
  }

  async function telegramLoop() {
    if (!telegramToken) return;
    if (!await verifyTelegramAccess()) {
      console.error("Telegram setup failed:", telegramState.lastError);
      return;
    }
    while (true) {
      try {
        var updates = await telegramCall("getUpdates", { offset: offsetState.offset || 0, timeout: 25, allowed_updates: ["message", "channel_post", "edited_message", "edited_channel_post"] });
        telegramState.connected = true;
        telegramState.lastPollAt = new Date().toISOString();
        telegramState.lastError = "";
        for (var index = 0; index < updates.length; index += 1) {
          var update = updates[index];
          offsetState.offset = Number(update.update_id || 0) + 1;
          persistJson(OFFSET_FILE, offsetState);
          telegramState.lastUpdateAt = new Date().toISOString();
          var message = extractTelegramMessage(update);
          if (message) {
            telegramState.lastUpdateChatId = message.chatId;
            telegramState.lastUpdateChatTitle = message.chatTitle;
            telegramState.lastUpdateChatType = message.chatType;
          }
          if (!message || (allowedChats.size && !allowedChats.has(message.chatId))) continue;
          telegramState.lastAcceptedMessageAt = new Date().toISOString();
          await inspectMessage(message);
        }
      } catch (error) {
        telegramState.connected = false;
        telegramState.lastError = error.message;
        console.error("Telegram polling failed:", error.message);
        await sleep(5000);
      }
    }
  }

  var server = http.createServer(function (request, response) {
    var url = new URL(request.url, "http://127.0.0.1:" + PORT);
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
    if (url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/api/events") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, events: store.list(url.searchParams.get("limit")), service: { chatIds: Array.from(allowedChats), telegram: telegramState, mode: "telegram-hash-first", relaySource: relay.apiKey ? "v3-term" : "v2-hash" } }));
      return;
    }
    if (url.pathname === "/api/status") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, events: store.list(EVENT_LIMIT).length, telegram: telegramState, chatIds: Array.from(allowedChats), mode: "telegram-hash-first", relaySource: relay.apiKey ? "v3-term" : "v2-hash" }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  server.listen(PORT, "127.0.0.1", function () {
    console.log("FOMO monitor listening on http://127.0.0.1:" + PORT);
    console.log("Telegram chat allowlist: " + Array.from(allowedChats).join(", "));
    console.log("Mode: " + (telegramToken ? "Telegram -> hash -> Relay" : "waiting for TELEGRAM_BOT_TOKEN"));
  });
  if (telegramToken) telegramLoop();
}

if (require.main === module) {
  main().catch(function (error) { console.error(error.message); process.exitCode = 1; });
}

module.exports = { extractAddresses, extractHashes, extractTelegramMessage, hasRelayHint, parseTelegramRemark, selectRequestForMessage };
