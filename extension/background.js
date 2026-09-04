importScripts("relay-core.js", "monitor-config.js");

(function () {
  "use strict";

  var MONITOR_API_BASE_KEY = "monitorApiBase";

  function getMonitorApiBase() {
    return new Promise(function (resolve) {
      chrome.storage.local.get({ [MONITOR_API_BASE_KEY]: "" }, function (items) {
        resolve(FomoMonitorConfig.normalizeApiBase(items[MONITOR_API_BASE_KEY]));
      });
    });
  }

  async function fetchMonitorJson(path) {
    var base = await getMonitorApiBase();
    if (!base) throw new Error("请先在插件弹窗配置后端 API 地址");
    var response = await fetch(FomoMonitorConfig.endpoint(base, path), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || !body.ok) throw new Error(body.error || "HTTP " + response.status);
    return { base: base, body: body };
  }

  async function getMonitorEvents() {
    var result = await fetchMonitorJson("/api/events?limit=100");
    var service = Object.assign({}, result.body.service || {}, { apiBase: result.base });
    return { ok: true, source: "monitor", requests: RelayViewer.uniqueById(result.body.events || []), service: service };
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message) return undefined;
    if (message.type === "monitor:events") {
      getMonitorEvents()
        .then(sendResponse)
        .catch(function (error) { sendResponse({ ok: false, error: error.message || "监控 API 不可用" }); });
      return true;
    }
    return undefined;
  });
})();
