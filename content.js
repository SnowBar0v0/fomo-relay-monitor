(function () {
  "use strict";

  var PANEL_ID = "relay-purchase-lens";
  var POSITION_KEY = "relayPurchaseLensPosition";
  var SIZE_KEY = "relayPurchaseLensSize";
  var CLOSED_KEY = "relayPurchaseLensClosed";
  var SOUND_KEY = "relayPurchaseLensSound";
  var POLL_INTERVAL_MS = 1000;
  var state = { loading: false, loaded: false, collapsed: false, closed: false, visibilityChanged: false, requests: [], source: "", error: "", service: {}, position: null, size: null, knownEvents: {}, initialized: false, flashIds: {}, soundEnabled: true, audioContext: null, renderedSignature: "" };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function ensureMount() {
    var existing = document.getElementById(PANEL_ID);
    if (existing) return existing;
    var mount = document.createElement("section");
    mount.id = PANEL_ID;
    mount.setAttribute("aria-label", "FOMO EVM 买入监控");
    (document.body || document.documentElement).appendChild(mount);
    mount.attachShadow({ mode: "open" });
    return mount;
  }

  function styleText() {
    return ""
      + ":host{display:block;contain:none;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f2efe5;pointer-events:none}"
      + ".wrap{position:fixed;z-index:2147483646;top:76px;right:16px;width:min(470px,calc(100vw - 24px));min-width:330px;min-height:190px;max-width:calc(100vw - 16px);max-height:calc(100vh - 24px);resize:both;overflow:hidden;pointer-events:auto;border:1px solid #3d4131;border-radius:5px;background:#0d100d;box-shadow:10px 12px 0 rgba(12,15,12,.28),0 20px 48px rgba(0,0,0,.42)}"
      + ".top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px;padding:12px 13px 11px;border-bottom:1px solid #0d100d;background:#d8ff51;cursor:grab;user-select:none}.top:active{cursor:grabbing}.brand-line{display:flex;align-items:center;gap:7px;color:#0d100d;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.brand-mark{display:inline-block;width:9px;height:9px;background:#f05c48;border:2px solid #0d100d}.title{margin-top:4px;color:#0d100d;font-size:19px;font-weight:900;letter-spacing:0;line-height:1.05}.subtitle{margin-top:5px;color:#33401a;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}.actions{display:flex;align-items:center;gap:4px;flex-shrink:0}.source{align-self:center;color:#33401a;font-size:9px;font-weight:800;white-space:nowrap}.action{width:28px;height:27px;padding:0;border:1px solid #0d100d;border-radius:4px;background:#111611;color:#d8ff51;cursor:pointer;font:inherit;font-size:14px;font-weight:800;line-height:25px}.action:hover{background:#29321d;color:#fff}.action.sound-off{color:#828778}.action.close{color:#ffb3a8;border-color:#4e211e}.action.close:hover{background:#642b24;color:#fff}.action:disabled{opacity:.55;cursor:wait}"
      + ".signalbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 11px;border-bottom:1px solid #303528;background:#171b15;color:#89927f;font-size:9px;letter-spacing:.04em;text-transform:uppercase}.signalbar strong{color:#d8ff51;font-size:10px}.signalbar .count{color:#f2efe5;font-weight:800}.signalbar .pulse{display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:#f05c48;vertical-align:1px;box-shadow:0 0 0 3px rgba(240,92,72,.14)}"
      + ".feed{height:calc(100% - 101px);min-height:100px;max-height:calc(100vh - 105px);overflow:auto;padding:10px;background:#0d100d}.trade{position:relative;padding:12px 12px 11px;border:1px solid #c9c5b8;border-left:4px solid #7b8370;border-radius:3px;background:#f2efe5;color:#151811;box-shadow:3px 3px 0 #4a503d}.trade+.trade{margin-top:10px}.trade.is-new{border-left-color:#f05c48;box-shadow:3px 3px 0 #f05c48;animation:newSignal .8s ease-out 2}.trade-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.identity{min-width:0}.remark{min-width:0;color:#151811;font-size:13px;font-weight:900;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.time{color:#77806f;font-size:9px;font-weight:700;white-space:nowrap}.meta-row{display:flex;align-items:center;gap:7px;margin-top:7px}.status{display:inline-flex;align-items:center;padding:3px 6px;border-radius:3px;background:#151811;color:#d8ff51;font-size:9px;font-weight:900;letter-spacing:.04em}.refund{background:#825b24;color:#fff0c4}.failed{background:#963c32;color:#fff1ed}.pending,.unknown{background:#68705e;color:#fff}.route{display:flex;align-items:center;gap:6px;margin-top:11px;color:#424b37;font-size:11px;font-weight:850}.route-dot{width:7px;height:7px;border-radius:1px;background:#f05c48}.route-arrow{color:#909681;font-size:14px}.amount-row{display:flex;align-items:baseline;gap:8px;margin-top:7px;min-width:0}.amount-in{color:#707866;font-size:11px;font-weight:700;white-space:nowrap}.amount-arrow{color:#8c9581;font-size:12px}.amount-out{min-width:0;color:#151811;font-size:21px;font-weight:950;letter-spacing:0;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.amount-out .symbol{margin-left:5px;color:#d44e3d;font-size:12px;font-weight:950}.address-row{display:flex;align-items:center;gap:7px;margin-top:10px;padding-top:8px;border-top:1px solid #d7d3c7;min-width:0}.address-label{width:40px;color:#7a8372;font-size:9px;font-weight:900;letter-spacing:.04em;flex-shrink:0}.address-value{min-width:0;flex:1;color:#38412f;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.copy{display:inline-flex;align-items:center;gap:3px;height:23px;padding:0 7px;border:1px solid #818a72;border-radius:3px;background:#d8ff51;color:#151811;cursor:pointer;font:inherit;font-size:9px;font-weight:900;white-space:nowrap}.copy:hover{background:#efffa8}.token-contract .address-value{color:#b84939}.foot{padding:7px 10px;border-top:1px solid #303528;background:#171b15;color:#89927f;font-size:9px;line-height:1.35}.empty,.error{padding:28px 10px;color:#89927f;font-size:11px;text-align:center}.error{color:#ff9b8f}.collapsed .signalbar,.collapsed .feed,.collapsed .foot{display:none}.collapsed{min-height:0;height:auto !important;resize:none}@keyframes newSignal{0%{transform:translateX(8px);opacity:.2}55%{transform:translateX(0);opacity:1}100%{transform:translateX(0);opacity:1}}"
      + "@media(max-width:700px){.wrap{top:10px;right:8px;width:calc(100vw - 16px);min-width:0;max-height:calc(100vh - 20px)}.source{display:none}.subtitle{max-width:170px}.title{font-size:17px}.amount-out{font-size:18px}}";
  }

  function layoutStyle() {
    var styles = [];
    if (state.position) styles.push("left:" + state.position.left + "px", "top:" + state.position.top + "px", "right:auto");
    if (state.size) {
      styles.push("width:" + state.size.width + "px");
      if (!state.collapsed) styles.push("height:" + state.size.height + "px");
    }
    return styles.length ? ' style="' + styles.join(";") + '"' : "";
  }

  function clampPosition(left, top, wrap) {
    var rect = wrap.getBoundingClientRect();
    return {
      left: Math.round(Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))),
      top: Math.round(Math.max(8, Math.min(top, window.innerHeight - rect.height - 8)))
    };
  }

  function saveLayout() {
    if (!chrome.storage || !chrome.storage.local) return;
    var values = {};
    if (state.position) values[POSITION_KEY] = state.position;
    if (state.size) values[SIZE_KEY] = state.size;
    chrome.storage.local.set(values);
  }

  function resetPosition() {
    state.position = null;
    if (chrome.storage && chrome.storage.local) chrome.storage.local.remove(POSITION_KEY);
    render();
  }

  function resetSize() {
    state.size = null;
    if (chrome.storage && chrome.storage.local) chrome.storage.local.remove(SIZE_KEY);
    render();
  }

  function removeMount() {
    var mount = document.getElementById(PANEL_ID);
    if (!mount) return;
    if (mount.__sizeObserver) {
      mount.__sizeObserver.disconnect();
      mount.__sizeObserver = null;
    }
    mount.remove();
  }

  function setClosed(closed) {
    state.closed = Boolean(closed);
    state.visibilityChanged = true;
    if (chrome.storage && chrome.storage.local) chrome.storage.local.set({ [CLOSED_KEY]: state.closed });
  }

  function saveSoundPreference() {
    if (chrome.storage && chrome.storage.local) chrome.storage.local.set({ [SOUND_KEY]: state.soundEnabled });
  }

  function audioContext() {
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    if (!state.audioContext) {
      try { state.audioContext = new Context(); } catch (error) { return null; }
    }
    return state.audioContext;
  }

  function unlockSound() {
    if (!state.soundEnabled) return;
    var context = audioContext();
    if (context && context.state === "suspended") context.resume().catch(function () {});
  }

  function playPurchaseTone() {
    if (!state.soundEnabled) return;
    var context = audioContext();
    if (!context) return;
    var play = function () {
      var now = context.currentTime;
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(740, now);
      oscillator.frequency.exponentialRampToValueAtTime(1046, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.38);
    };
    if (context.state === "suspended") context.resume().then(play).catch(function () {});
    else play();
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    saveSoundPreference();
    if (state.soundEnabled) playPurchaseTone();
    render();
  }

  function eventKey(request) {
    var item = request || {};
    return String(item.id || [item.createdAt, item.input && item.input.amountFormatted, item.output && item.output.symbol].join("|"));
  }

  function isSuccessfulPurchase(request) {
    return Boolean(request && request.isSuccessful && request.isPurchase !== false);
  }

  function trackEvents(requests) {
    var incoming = Array.isArray(requests) ? requests : [];
    var newPurchases = [];
    incoming.forEach(function (request) {
      var key = eventKey(request);
      var outcome = request && request.outcome ? request.outcome : "unknown";
      if (state.initialized && isSuccessfulPurchase(request) && state.knownEvents[key] !== "success") {
        newPurchases.push(request);
        state.flashIds[key] = true;
      }
      state.knownEvents[key] = isSuccessfulPurchase(request) ? "success" : outcome;
    });
    state.initialized = true;
    if (newPurchases.length) {
      playPurchaseTone();
      setTimeout(function () {
        newPurchases.forEach(function (request) { delete state.flashIds[eventKey(request)]; });
        render(true);
      }, 5200);
    }
    return newPurchases.length > 0;
  }

  function closeFloating() {
    state.loading = false;
    setClosed(true);
    removeMount();
  }

  function showFloating() {
    setClosed(false);
    ensureMount();
    render(true);
    load(true);
  }

  function restoreLayout() {
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get([POSITION_KEY, SIZE_KEY, CLOSED_KEY, SOUND_KEY], function (result) {
      var position = result && result[POSITION_KEY];
      var size = result && result[SIZE_KEY];
      if (position && Number.isFinite(Number(position.left)) && Number.isFinite(Number(position.top))) {
        state.position = { left: Number(position.left), top: Number(position.top) };
      }
      if (size && Number.isFinite(Number(size.width)) && Number.isFinite(Number(size.height))) {
        state.size = { width: Math.max(310, Number(size.width)), height: Math.max(180, Number(size.height)) };
      }
      if (result && typeof result[SOUND_KEY] === "boolean") state.soundEnabled = result[SOUND_KEY];
      if (!state.visibilityChanged) state.closed = result && result[CLOSED_KEY] === true;
      if (state.closed) removeMount();
      else {
        render();
        load(false);
      }
    });
  }

  function observeSize(mount) {
    if (mount.__sizeObserver) {
      mount.__sizeObserver.disconnect();
      mount.__sizeObserver = null;
    }
    if (state.closed || state.collapsed) return;
    var wrap = mount.shadowRoot && mount.shadowRoot.querySelector(".wrap");
    if (!wrap || typeof ResizeObserver !== "function") return;
    mount.__sizeObserver = new ResizeObserver(function (entries) {
      if (!entries.length) return;
      var rect = entries[0].contentRect;
      var next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      if (next.width < 310 || next.height < 180) return;
      if (!state.size || state.size.width !== next.width || state.size.height !== next.height) {
        state.size = next;
        saveLayout();
      }
    });
    mount.__sizeObserver.observe(wrap);
  }

  function sourceLabel() {
    if (state.source === "monitor") return "私有 API";
    return "未连接";
  }

  function dateText(value) {
    if (!value) return "-";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  }

  function shortAddress(value) {
    var address = String(value || "");
    if (address.length <= 16) return address;
    return address.slice(0, 7) + "..." + address.slice(-7);
  }

  function friendlyAmount(value, decimals) {
    var exact = String(value === undefined || value === null ? "" : value).replace(/,/g, "");
    if (!Number.isFinite(Number(exact))) return exact || "-";
    if (decimals !== undefined) return RelayViewer.formatDecimal(exact, decimals);
    return RelayViewer.displayAmount(exact);
  }

  function copyButton(address, label) {
    if (!address) return "";
    return '<button class="copy" type="button" data-copy-address="' + escapeHtml(address) + '" title="复制' + escapeHtml(label) + '">⧉ ' + escapeHtml(label) + '</button>';
  }

  function addressRow(label, address, className) {
    if (!address) return "";
    return '<div class="address-row ' + (className || "") + '"><span class="address-label">' + escapeHtml(label) + '</span><code class="address-value" title="' + escapeHtml(address) + '">' + escapeHtml(shortAddress(address)) + '</code>' + copyButton(address, "复制") + '</div>';
  }

  function chainLabel(output) {
    var chain = output && (output.chainName || RelayViewer.chainName(output.chainId));
    return chain === "Robinhood Chain" ? "Robinhood" : chain || "未知链";
  }

  function findRemark(request) {
    return request.remark || request.user || request.recipient || "TG消息";
  }

  function tradeCard(request) {
    var input = request.input || {};
    var output = request.output || {};
    var inputAmount = friendlyAmount(input.amountFormatted || input.amount, 4);
    var outputExact = request.outputAmount || output.amountFormatted || output.amount;
    var outputAmount = request.isSuccessful ? friendlyAmount(outputExact) : "未确认";
    var outputSymbol = output.symbol || "未知代币";
    var remark = findRemark(request);
    var recipient = request.recipient && request.recipient !== request.user ? request.recipient : "";
    var detail = request.isSuccessful ? "" : request.isRefund ? " · 已退款" : " · " + (request.statusLabel || "处理中");
    return '<article class="trade' + (state.flashIds[eventKey(request)] ? ' is-new' : '') + '">'
      + '<div class="trade-head"><div class="remark" title="' + escapeHtml(remark) + '">' + escapeHtml(remark) + '</div><time class="time">' + escapeHtml(dateText(request.createdAt || request.updatedAt)) + '</time></div>'
      + '<div class="meta-row"><span class="status ' + escapeHtml(request.outcome || "unknown") + '">' + escapeHtml(request.statusLabel || "未知") + '</span></div>'
      + '<div class="route"><span class="route-dot"></span><span>买入 ' + escapeHtml(chainLabel(output)) + '</span><span class="route-arrow">›</span><span>' + escapeHtml(outputSymbol) + escapeHtml(detail) + '</span></div>'
      + '<div class="amount-row"><span class="amount-in">' + escapeHtml(inputAmount) + ' ' + escapeHtml(input.symbol || "") + '</span><span class="amount-arrow">→</span><strong class="amount-out">' + escapeHtml(outputAmount) + '<span class="symbol">' + escapeHtml(outputSymbol) + '</span></strong></div>'
      + addressRow("钱包", request.user, "wallet")
      + addressRow("合约", request.isSuccessful ? output.address : "", "token-contract")
      + addressRow("接收", recipient, "recipient")
      + '</article>';
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    return new Promise(function (resolve, reject) {
      var input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      try {
        if (!document.execCommand("copy")) throw new Error("copy failed");
        resolve();
      } catch (error) { reject(error); }
      input.remove();
    });
  }

  function bindShadowEvents(mount) {
    if (mount.__relayEventsBound) return;
    mount.__relayEventsBound = true;
    mount.shadowRoot.addEventListener("click", function (event) {
      var target = event.target;
      var copy = target && target.closest ? target.closest("[data-copy-address]") : null;
      if (copy) {
        copyText(copy.getAttribute("data-copy-address")).then(function () {
          var previous = copy.textContent;
          copy.textContent = "已复制";
          setTimeout(function () { if (copy.isConnected) copy.textContent = previous; }, 1300);
        }).catch(function () { copy.textContent = "复制失败"; });
        return;
      }
      var action = target && target.closest ? target.closest("[data-action]") : null;
      if (!action) return;
      var name = action.getAttribute("data-action");
      if (name === "refresh") load(true);
      if (name === "sound") toggleSound();
      if (name === "collapse") { state.collapsed = !state.collapsed; render(); }
      if (name === "reset-position") resetPosition();
      if (name === "reset-size") resetSize();
      if (name === "close") closeFloating();
    });
    mount.shadowRoot.addEventListener("pointerdown", function (event) {
      unlockSound();
      var target = event.target;
      var handle = target && target.closest ? target.closest("[data-drag-handle]") : null;
      if (!handle || (target.closest && target.closest("button,a,input,textarea"))) return;
      var wrap = mount.shadowRoot.querySelector(".wrap");
      if (!wrap) return;
      var rect = wrap.getBoundingClientRect();
      var start = state.position || { left: rect.left, top: rect.top };
      var dragging = { startX: event.clientX, startY: event.clientY, left: start.left, top: start.top };
      var move = function (moveEvent) {
        var next = clampPosition(dragging.left + moveEvent.clientX - dragging.startX, dragging.top + moveEvent.clientY - dragging.startY, wrap);
        state.position = next;
        wrap.style.left = next.left + "px";
        wrap.style.top = next.top + "px";
        wrap.style.right = "auto";
      };
      var end = function () {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", end, true);
        saveLayout();
      };
      event.preventDefault();
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", end, true);
    });
  }

  function render() {
    if (state.closed) {
      removeMount();
      return;
    }
    var signature = JSON.stringify({
      loaded: state.loaded,
      error: state.error,
      source: state.source,
      chatIds: state.service.chatIds || [],
      requests: state.requests,
      collapsed: state.collapsed,
      soundEnabled: state.soundEnabled,
      position: state.position,
      size: state.size,
      flashIds: Object.keys(state.flashIds).sort()
    });
    if (!arguments[0] && signature === state.renderedSignature) return;
    state.renderedSignature = signature;
    var mount = ensureMount();
    bindShadowEvents(mount);
    var rows = state.requests.slice(0, 30).map(tradeCard).join("");
    var feedBody = state.loading
      ? '<div class="empty">正在读取 FOMO EVM 买入...</div>'
      : state.error && !state.requests.length
        ? '<div class="error">' + escapeHtml(state.error) + '</div>'
        : !state.requests.length
          ? '<div class="empty">暂无 FOMO EVM 买入</div>'
          : rows;
    var subtitle = state.source === "monitor" ? "只读事件流 · 自动更新" : "请在插件弹窗配置后端 API";
    var count = state.requests.length ? state.requests.length + " 条记录" : "等待中";
    var soundLabel = state.soundEnabled ? "提示音已开" : "提示音已关";
    var soundIcon = "♪";
    mount.shadowRoot.innerHTML = '<style>' + styleText() + '</style>'
      + '<div class="wrap' + (state.collapsed ? ' collapsed' : '') + '"' + layoutStyle() + '>'
      + '<div class="top" data-drag-handle="true"><div><div class="brand-line"><span class="brand-mark"></span><span>BUY SIGNALS</span><span>LIVE FEED</span></div><div class="title">FOMO EVM 买入监控</div><div class="subtitle" title="' + escapeHtml(subtitle) + '">' + escapeHtml(subtitle) + '</div></div>'
      + '<div class="actions"><span class="source">' + escapeHtml(sourceLabel()) + '</span><button class="action" type="button" data-action="refresh" title="刷新" aria-label="刷新">↻</button><button class="action ' + (state.soundEnabled ? "" : "sound-off") + '" type="button" data-action="sound" title="' + escapeHtml(soundLabel) + '" aria-label="' + escapeHtml(soundLabel) + '">' + soundIcon + '</button><button class="action" type="button" data-action="reset-position" title="恢复默认位置" aria-label="恢复默认位置">⌖</button><button class="action" type="button" data-action="reset-size" title="恢复默认大小" aria-label="恢复默认大小">↗</button><button class="action" type="button" data-action="collapse" title="收起或展开" aria-label="收起或展开">' + (state.collapsed ? "＋" : "−") + '</button><button class="action close" type="button" data-action="close" title="关闭悬浮窗" aria-label="关闭悬浮窗">×</button></div></div>'
      + '<div class="signalbar"><span><i class="pulse"></i><strong>LIVE</strong> · API → EVM</span><span class="count">' + escapeHtml(count) + '</span></div>'
      + '<div class="feed">' + feedBody + '</div>'
      + '<div class="foot">' + escapeHtml(count) + ' · 可拖动顶部移动，拖右下角调整大小</div>'
      + '</div>';
    observeSize(mount);
  }

  function completeLoad(response, fallbackError) {
    state.loading = false;
    if (chrome.runtime.lastError) {
      state.error = chrome.runtime.lastError.message || fallbackError;
      state.requests = [];
      state.source = "";
    } else if (!response || !response.ok) {
      state.error = response && response.error ? response.error : fallbackError;
      state.requests = [];
      state.source = "";
    } else {
      state.error = "";
      state.requests = RelayViewer.uniqueById(response.requests || []);
      state.source = response.source || "unknown";
      state.service = response.service || {};
    }
    state.loaded = true;
    var hasNewPurchase = state.requests.length || (response && response.ok) ? trackEvents(state.requests) : false;
    render(hasNewPurchase);
  }

  function load(force) {
    if (state.loading || state.closed) return;
    state.loading = true;
    state.error = "";
    if (!state.loaded) render(true);
    chrome.runtime.sendMessage({ type: "monitor:events" }, function (response) {
      completeLoad(response, "监控 API 未连接");
    });
  }

  function init() {
    restoreLayout();
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.type !== "monitor:show") return undefined;
    showFloating();
    sendResponse({ ok: true });
    return undefined;
  });

  init();
  setInterval(function () {
    if (state.closed) return;
    if (!state.loading) load(false);
    else if (!document.getElementById(PANEL_ID)) { ensureMount(); render(true); }
  }, POLL_INTERVAL_MS);
})();
