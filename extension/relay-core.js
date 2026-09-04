(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RelayViewer = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CHAIN_NAMES = {
    "1": "Ethereum",
    "10": "Optimism",
    "56": "BNB Chain",
    "137": "Polygon",
    "8453": "Base",
    "42161": "Arbitrum",
    "43114": "Avalanche",
    "4663": "Robinhood Chain",
    "792703809": "Solana"
  };

  var SUCCESS_STATUSES = ["success", "completed", "complete", "filled"];
  var REFUND_STATUSES = ["refund", "refunded", "reverted"];
  var FAILED_STATUSES = ["failed", "failure", "error", "cancelled", "canceled"];
  var PENDING_STATUSES = ["pending", "processing", "waiting", "in_progress"];
  var STABLECOIN_SYMBOLS = ["USDC", "USDC.E", "USDT", "DAI", "USDS", "USDG", "FDUSD", "FRAX", "PYUSD", "PUSD", "CUSD"];
  var NATIVE_SYMBOLS = ["SOL", "ETH", "WETH", "BNB", "MATIC", "POL", "AVAX", "OP", "ARB", "BASE", "RBTC", "HYPE"];

  function toText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function formatDecimal(value, maxDecimals) {
    var text = toText(value).trim();
    if (!text) return "-";

    var negative = text.charAt(0) === "-";
    if (negative) text = text.slice(1);

    var parts = text.split(".");
    var integer = parts[0] || "0";
    var fraction = parts[1] || "";
    if (maxDecimals !== undefined) fraction = fraction.slice(0, maxDecimals);
    fraction = fraction.replace(/0+$/, "");
    integer = integer.replace(/^0+(?=\d)/, "");
    integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    var result = integer + (fraction ? "." + fraction : "");
    return negative ? "-" + result : result;
  }

  function formatUnits(rawAmount, decimals) {
    var raw = toText(rawAmount).trim();
    var precision = Number(decimals);
    if (!raw) return "-";
    if (!Number.isInteger(precision) || precision < 0 || precision > 255) {
      return formatDecimal(raw, 8);
    }

    try {
      var negative = raw.charAt(0) === "-";
      var digits = negative ? raw.slice(1) : raw;
      var integer = BigInt(digits || "0");
      var scale = BigInt(10) ** BigInt(precision);
      var whole = integer / scale;
      var fraction = integer % scale;
      var fractionText = precision ? fraction.toString().padStart(precision, "0") : "";
      fractionText = fractionText.replace(/0+$/, "");
      var result = whole.toString() + (fractionText ? "." + fractionText : "");
      return formatDecimal(negative ? "-" + result : result);
    } catch (error) {
      var numeric = Number(raw) / Math.pow(10, precision);
      return Number.isFinite(numeric) ? formatDecimal(String(numeric), 8) : "-";
    }
  }

  function compactNumber(value) {
    var text = toText(value).replace(/,/g, "").trim();
    var numeric = Number(text);
    if (!Number.isFinite(numeric)) return formatDecimal(value, 6);

    var absolute = Math.abs(numeric);
    var divisor = 1;
    var suffix = "";
    if (absolute >= 1000000000) { divisor = 1000000000; suffix = "B"; }
    else if (absolute >= 1000000) { divisor = 1000000; suffix = "M"; }
    else if (absolute >= 1000) { divisor = 1000; suffix = "K"; }
    if (!suffix) return formatDecimal(text, 6);

    var scaled = numeric / divisor;
    var decimals = Math.abs(scaled) >= 1000 ? 0 : Math.abs(scaled) >= 100 ? 1 : 2;
    return formatDecimal(scaled.toFixed(decimals), decimals) + suffix;
  }

  function displayAmount(value) {
    var text = toText(value).replace(/,/g, "").trim();
    var numeric = Number(text);
    if (!Number.isFinite(numeric)) return formatDecimal(value, 6);

    var absolute = Math.abs(numeric);
    if (absolute >= 1000000000) return formatDecimal((numeric / 1000000000).toFixed(2), 2) + "B";
    if (absolute >= 1000000) return formatDecimal((numeric / 1000000).toFixed(2), 2) + "M";
    if (absolute >= 10000) return formatDecimal((numeric / 1000).toFixed(2), 2) + "K";
    if (absolute >= 1000) return formatDecimal(text, 1);
    return formatDecimal(text, 6);
  }

  function amountText(amountObject, currency) {
    if (!amountObject) return "-";
    if (amountObject.amountFormatted !== undefined && amountObject.amountFormatted !== null) {
      return formatDecimal(amountObject.amountFormatted);
    }
    return formatUnits(amountObject.amount, currency && currency.decimals);
  }

  function classifyStatus(status) {
    var normalized = toText(status).toLowerCase().replace(/[- ]/g, "_");
    if (SUCCESS_STATUSES.indexOf(normalized) >= 0) return "success";
    if (REFUND_STATUSES.indexOf(normalized) >= 0) return "refund";
    if (FAILED_STATUSES.indexOf(normalized) >= 0) return "failed";
    if (PENDING_STATUSES.indexOf(normalized) >= 0) return "pending";
    return "unknown";
  }

  function statusLabel(outcome) {
    return {
      success: "已买入",
      refund: "已退款",
      failed: "失败",
      pending: "处理中",
      unknown: "未知"
    }[outcome] || "未知";
  }

  function currencyView(amountObject) {
    var amount = amountObject || {};
    var currency = amount.currency || {};
    return {
      chainId: currency.chainId,
      chainName: chainName(currency.chainId),
      address: currency.address || "",
      symbol: currency.symbol || currency.name || "未知代币",
      name: currency.name || currency.symbol || "未知代币",
      decimals: currency.decimals,
      amount: amount.amount,
      amountFormatted: amountText(amount, currency),
      usd: amount.amountUsd || amount.amountUsdCurrent || ""
    };
  }

  function isLikelyPurchase(input, output) {
    var inputSymbol = toText(input && input.symbol).toUpperCase();
    var outputSymbol = toText(output && output.symbol).toUpperCase();
    var baseCurrency = STABLECOIN_SYMBOLS.indexOf(inputSymbol) >= 0 || NATIVE_SYMBOLS.indexOf(inputSymbol) >= 0;
    var targetAsset = outputSymbol && STABLECOIN_SYMBOLS.indexOf(outputSymbol) < 0;
    return baseCurrency && targetAsset;
  }

  function normalizeRequest(request) {
    var raw = request || {};
    var data = raw.data || {};
    var metadata = data.metadata || {};
    var inputObject = metadata.currencyIn || data.currencyIn || {};
    var outputObject = metadata.currencyOut || data.currencyOut || {};
    var outcome = classifyStatus(raw.status || data.status);
    var input = currencyView(inputObject);
    var output = currencyView(outputObject);

    return {
      id: toText(raw.id),
      status: toText(raw.status || data.status).toLowerCase() || "unknown",
      outcome: outcome,
      statusLabel: statusLabel(outcome),
      isSuccessful: outcome === "success",
      isRefund: outcome === "refund",
      isFailed: outcome === "failed",
      isPending: outcome === "pending",
      createdAt: raw.createdAt || raw.updatedAt || "",
      updatedAt: raw.updatedAt || "",
      user: raw.user || metadata.sender || "",
      recipient: raw.recipient || metadata.recipient || "",
      remark: raw.remark || raw.addressRemark || "",
      input: input,
      output: output,
      isPurchase: isLikelyPurchase(input, output),
      outputAmount: output.amountFormatted,
      inTxs: Array.isArray(data.inTxs) ? data.inTxs.map(transactionView) : [],
      outTxs: Array.isArray(data.outTxs) ? data.outTxs.map(transactionView) : []
    };
  }

  function transactionView(transaction) {
    var item = transaction || {};
    return {
      hash: toText(item.hash || item.transactionId),
      chainId: item.chainId,
      chainName: chainName(item.chainId),
      status: toText(item.status).toLowerCase()
    };
  }

  function parseResponse(payload, source) {
    var response = payload || {};
    var items = Array.isArray(response.requests)
      ? response.requests
      : Array.isArray(response.data)
        ? response.data
        : [];
    return {
      source: source || "unknown",
      requests: items.map(normalizeRequest),
      continuation: response.continuation || response.nextContinuation || null,
      deprecation: response.deprecation || null
    };
  }

  function chainName(chainId) {
    var key = toText(chainId);
    return CHAIN_NAMES[key] || (key ? "Chain " + key : "未知链");
  }

  function txUrl(transaction) {
    var tx = transaction || {};
    if (!tx.hash) return "";
    var chainId = toText(tx.chainId);
    if (chainId === "792703809") return "https://solscan.io/tx/" + encodeURIComponent(tx.hash);
    if (chainId === "4663") return "https://8crv4vmq6tiu1yqr.blockscout.com/tx/" + encodeURIComponent(tx.hash);
    if (chainId === "1") return "https://etherscan.io/tx/" + encodeURIComponent(tx.hash);
    if (chainId === "8453") return "https://basescan.org/tx/" + encodeURIComponent(tx.hash);
    return "";
  }

  function isLikelyAddress(value) {
    var address = toText(value).trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  function uniqueById(requests) {
    var seen = {};
    return (requests || []).filter(function (request) {
      var key = request.id || [request.createdAt, request.input.amountFormatted, request.output.symbol].join("|");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  return {
    chainName: chainName,
    classifyStatus: classifyStatus,
    compactNumber: compactNumber,
    displayAmount: displayAmount,
    formatDecimal: formatDecimal,
    formatUnits: formatUnits,
    isLikelyAddress: isLikelyAddress,
    isLikelyPurchase: isLikelyPurchase,
    normalizeRequest: normalizeRequest,
    parseResponse: parseResponse,
    statusLabel: statusLabel,
    transactionView: transactionView,
    txUrl: txUrl,
    uniqueById: uniqueById
  };
});
