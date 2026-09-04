(function () {
  "use strict";

  var MONITOR_API_BASE_KEY = "monitorApiBase";
  var status = document.getElementById("status");
  var eventsList = document.getElementById("events-list");
  var showButton = document.getElementById("show");
  var checkButton = document.getElementById("check");
  var saveConfigButton = document.getElementById("save-config");
  var apiBaseInput = document.getElementById("api-base");

  function setStatus(message, isError) {
    status.textContent = message;
    status.className = isError ? "status error" : "status";
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function shortTime(value) {
    if (!value) return "-";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function shortAddress(value) {
    var address = String(value || "");
    return address.length > 16 ? address.slice(0, 7) + "..." + address.slice(-7) : address;
  }

  function copyButton(address, label) {
    return address ? '<button class="event-copy" type="button" data-copy-address="' + escapeHtml(address) + '">⧉ ' + escapeHtml(label) + '</button>' : "";
  }

  function parseApiBase(value) {
    return FomoMonitorConfig.parseApiBase(value);
  }

  function requestBackendPermission(base) {
    return new Promise(function (resolve, reject) {
      if (!chrome.permissions || !chrome.permissions.request) {
        resolve(true);
        return;
      }
      chrome.permissions.request({ origins: [FomoMonitorConfig.originPattern(base)] }, function (granted) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!granted) {
          reject(new Error("未授权访问该后端地址"));
          return;
        }
        resolve(true);
      });
    });
  }

  function loadConfig() {
    chrome.storage.local.get({ [MONITOR_API_BASE_KEY]: "" }, function (items) {
      apiBaseInput.value = FomoMonitorConfig.normalizeApiBase(items[MONITOR_API_BASE_KEY]);
      if (apiBaseInput.value) checkService();
      else {
        eventsList.innerHTML = '<div class="event-empty">请先配置后端 API 地址</div>';
        setStatus("请先配置后端 API 地址", false);
      }
    });
  }

  function saveConfig() {
    saveConfigButton.disabled = true;
    try {
      var base = parseApiBase(apiBaseInput.value);
      requestBackendPermission(base).then(function () {
        chrome.storage.local.set({ [MONITOR_API_BASE_KEY]: base }, function () {
          if (chrome.runtime.lastError) {
            setStatus("配置保存失败：" + chrome.runtime.lastError.message, true);
          } else {
            setStatus("配置已保存：" + base, false);
            checkService();
          }
        });
      }).catch(function (error) {
        setStatus("配置保存失败：" + error.message, true);
      }).finally(function () {
        saveConfigButton.disabled = false;
      });
    } catch (error) {
      setStatus("配置保存失败：" + error.message, true);
      saveConfigButton.disabled = false;
    }
  }

  function renderEvents(events) {
    var rows = (events || []).slice(0, 20);
    if (!rows.length) {
      eventsList.innerHTML = '<div class="event-empty">暂无买入记录</div>';
      return;
    }
    eventsList.innerHTML = rows.map(function (event) {
      var input = event.input || {};
      var output = event.output || {};
      var amount = input.amountFormatted ? RelayViewer.formatDecimal(input.amountFormatted, 4) : "-";
      var received = event.isSuccessful ? RelayViewer.displayAmount(event.outputAmount || output.amountFormatted || "-") : "未确认";
      var token = output.symbol || "未知代币";
      var chain = output.chainName === "Robinhood Chain" ? "Robinhood" : output.chainName || RelayViewer.chainName(output.chainId);
      var recipient = event.recipient && event.recipient !== event.user ? event.recipient : "";
      return '<article class="event"><div class="event-line"><span class="event-remark" title="' + escapeHtml(event.remark || event.user || "TG消息") + '">' + escapeHtml(event.remark || event.user || "TG消息") + '</span><span class="event-time">' + shortTime(event.createdAt || event.updatedAt) + '</span></div>'
        + '<div class="event-route">买入 ' + escapeHtml(chain) + ' · <span class="event-token">' + escapeHtml(token) + '</span></div>'
        + '<div class="event-amount">' + escapeHtml(amount) + ' ' + escapeHtml(input.symbol || "") + ' <span>→</span> ' + escapeHtml(received) + ' ' + escapeHtml(token) + '</div>'
        + '<div class="event-address"><span>钱包 ' + escapeHtml(shortAddress(event.user)) + '</span>' + copyButton(event.user, "复制钱包") + '</div>'
        + '<div class="event-address"><span>合约 ' + escapeHtml(shortAddress(event.isSuccessful ? output.address : "")) + '</span>' + copyButton(event.isSuccessful ? output.address : "", "复制合约") + '</div>'
        + (recipient ? '<div class="event-address"><span>接收 ' + escapeHtml(shortAddress(recipient)) + '</span>' + copyButton(recipient, "复制接收") + '</div>' : "")
        + '</article>';
    }).join("");
  }

  function loadEvents() {
    chrome.runtime.sendMessage({ type: "monitor:events" }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        eventsList.innerHTML = '<div class="event-empty">监控 API 未连接</div>';
        return;
      }
      renderEvents(response.requests || []);
    });
  }

  async function fetchMonitorStatus() {
    var base = parseApiBase(apiBaseInput.value);
    var healthResponse = await fetch(FomoMonitorConfig.endpoint(base, "/health"), { cache: "no-store" });
    var healthBody = await healthResponse.json().catch(function () { return {}; });
    if (!healthResponse.ok || !healthBody.ok) throw new Error(healthBody.error || "健康检查失败");
    var response = await fetch(FomoMonitorConfig.endpoint(base, "/api/status"), { cache: "no-store" });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || !body.ok) throw new Error(body.error || "HTTP " + response.status);
    return Object.assign({}, body, { apiBase: base });
  }

  eventsList.addEventListener("click", function (event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-copy-address]") : null;
    if (!button) return;
    var address = button.getAttribute("data-copy-address");
    navigator.clipboard.writeText(address).then(function () {
      var previous = button.textContent;
      button.textContent = "已复制";
      setTimeout(function () { if (button.isConnected) button.textContent = previous; }, 1200);
    }).catch(function () { button.textContent = "复制失败"; });
  });

  function checkService() {
    checkButton.disabled = true;
    setStatus("正在检查监控服务…", false);
    fetchMonitorStatus()
      .then(function (body) {
        var telegramState = body.telegram || {};
        var telegram = telegramState.connected ? telegramState.chatAccessible === false && telegramState.chatChecks && telegramState.chatChecks.length ? "后端已连接，但目标聊天不可访问" : "后端已连接" : telegramState.configured ? "后端 Telegram 未连接" : "后端等待 Telegram 配置";
        var count = Number(body.events || 0);
        var detail = telegramState.lastError || telegramState.chatError || "";
        setStatus(telegram + (detail ? " · " + detail : "") + " · 已保存 " + count + " 条事件 · " + body.apiBase, Boolean(telegramState.lastError || telegramState.chatError));
        loadEvents();
      })
      .catch(function (error) {
        setStatus("监控服务未连接：" + error.message, true);
      })
      .finally(function () { checkButton.disabled = false; });
  }

  function showFloating() {
    showButton.disabled = true;
    setStatus("正在显示悬浮窗…", false);
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id) {
        setStatus("无法找到当前网页", true);
        showButton.disabled = false;
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { type: "monitor:show" }, function (response) {
        if (chrome.runtime.lastError) {
          setStatus("当前页面未加载插件，请刷新网页后重试", true);
        } else if (!response || !response.ok) {
          setStatus("悬浮窗打开失败", true);
        } else {
          setStatus("悬浮窗已显示", false);
        }
        showButton.disabled = false;
      });
    });
  }

  showButton.addEventListener("click", showFloating);
  saveConfigButton.addEventListener("click", saveConfig);
  checkButton.addEventListener("click", checkService);
  loadConfig();
})();
