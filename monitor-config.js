(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FomoMonitorConfig = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeApiBase(value) {
    return String(value || "").trim().replace(/\/+$/g, "");
  }

  function parseApiBase(value) {
    var normalized = normalizeApiBase(value);
    if (!normalized) throw new Error("请填写后端 API 地址");

    var url;
    try {
      url = new URL(normalized);
    } catch (error) {
      throw new Error("后端 API 地址格式不正确");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("仅支持 http 或 https");
    if (url.username || url.password) throw new Error("API 地址不能包含用户名或密码");
    if (url.search || url.hash) throw new Error("API 地址不能包含查询参数或片段");

    var path = url.pathname.replace(/\/+$/g, "");
    return url.origin + (path === "/" ? "" : path);
  }

  function originPattern(value) {
    return new URL(parseApiBase(value)).origin + "/*";
  }

  function endpoint(value, path) {
    var base = parseApiBase(value);
    var suffix = String(path || "");
    if (suffix.charAt(0) !== "/") suffix = "/" + suffix;
    return base + suffix;
  }

  return {
    endpoint: endpoint,
    normalizeApiBase: normalizeApiBase,
    originPattern: originPattern,
    parseApiBase: parseApiBase
  };
});
