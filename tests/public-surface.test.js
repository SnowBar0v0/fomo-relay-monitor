const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("public extension has no static Relay host permissions", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(manifest, "host_permissions"), false);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://*/*"]);
});

test("public client only contains configurable backend request paths", () => {
  const files = ["background.js", "content.js", "popup.html", "popup.js", "monitor-config.js", "manifest.json"];
  const source = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  const forbidden = ["https://api.relay.link", "relay:lookup", "/requests/v2", "/requests/v3"];
  forbidden.forEach((value) => assert.equal(source.includes(value), false, `forbidden client reference: ${value}`));
  assert.equal(source.includes("/health"), true);
  assert.equal(source.includes("/api/status"), true);
  assert.equal(source.includes("/api/events?limit=100"), true);
});

test("backend origin permission and storage are user-configured", () => {
  const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  assert.equal(popup.includes("chrome.permissions.request"), true);
  assert.equal(popup.includes("chrome.storage.local"), true);
  assert.equal(popup.includes("monitorApiBase"), true);
});

test("public release files do not contain production deployment data", () => {
  const publicFiles = [
    ".gitignore",
    "README.md",
    "background.js",
    "content.js",
    "docs/BACKEND_API_CONTRACT.md",
    "docs/DEVELOPER_REQUIREMENTS.md",
    "docs/EXTENSION_INSTALL.md",
    "manifest.json",
    "monitor-config.js",
    "package.json",
    "popup.css",
    "popup.html",
    "popup.js",
    "relay-core.js"
  ];
  const source = publicFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  const forbidden = [
    [/\/root\/codex-work\//i, "private deployment path"],
    [/TELEGRAM_BOT_TOKEN\s*=\s*[^\s#]+/i, "Telegram token value"],
    [/RELAY_API_KEY\s*=\s*[^\s#]+/i, "Relay API key value"]
  ];
  forbidden.forEach(([pattern, label]) => assert.equal(pattern.test(source), false, `public surface contains ${label}`));
});
