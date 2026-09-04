const assert = require("node:assert/strict");
const test = require("node:test");
const FomoMonitorConfig = require("../monitor-config.js");

test("normalizes a private backend URL without trailing slashes", () => {
  assert.equal(FomoMonitorConfig.parseApiBase("https://monitor.example.test///"), "https://monitor.example.test");
  assert.equal(FomoMonitorConfig.parseApiBase("http://127.0.0.1:8787/monitor/"), "http://127.0.0.1:8787/monitor");
});

test("builds only the documented read-only backend endpoints", () => {
  const base = "https://monitor.example.test";
  assert.equal(FomoMonitorConfig.endpoint(base, "/health"), "https://monitor.example.test/health");
  assert.equal(FomoMonitorConfig.endpoint(base, "/api/status"), "https://monitor.example.test/api/status");
  assert.equal(FomoMonitorConfig.endpoint(base, "/api/events?limit=100"), "https://monitor.example.test/api/events?limit=100");
});

test("rejects credentials, query strings, fragments, and unsupported protocols", () => {
  assert.throws(() => FomoMonitorConfig.parseApiBase("https://user:pass@monitor.example.test"), /用户名或密码/);
  assert.throws(() => FomoMonitorConfig.parseApiBase("https://monitor.example.test?token=secret"), /查询参数或片段/);
  assert.throws(() => FomoMonitorConfig.parseApiBase("ftp://monitor.example.test"), /http 或 https/);
});

test("requests permission for the backend origin only", () => {
  assert.equal(FomoMonitorConfig.originPattern("https://monitor.example.test/base"), "https://monitor.example.test/*");
});
