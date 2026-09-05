# FOMO EVM 买入监控

这是一个 Chrome/Edge Manifest V3 浏览器插件加可自部署 Node.js 后端，用于从 Telegram 监控消息识别 Relay 跨链后的 EVM 目标代币买入。

`self-hosted` 分支包含完整的 `extension/` 插件和 `server/` 后端。每个使用者自行部署后端、配置自己的 Telegram Bot 和频道/群，插件只请求用户填写的只读 API 地址。

不要把 Telegram token、Relay API key 或钱包私钥传给项目作者或任何第三方。密钥只应放在你自己的本机或 VPS 的 `.env` 中；`.env`、`data/` 和真实运行配置不应提交 Git。

## 功能

- Telegram 频道帖子、群消息和编辑消息读取。
- 从 Relay、Solscan、EVM explorer 链接或钱包地址线索匹配交易。
- 展示地址备注、买入金额、目标链、代币、到账数量和合约地址。
- 插件悬浮窗支持拖动、调整尺寸、收起、关闭、重新显示和复制地址。
- 后端只提供 `GET /health`、`GET /api/status`、`GET /api/events?limit=100`。

## 自部署后端

要求 Node.js 18 或更高版本。完整的“创建后端 Bot、建立目标频道、加入后端 Bot 和监控推送 Bot、获取 `chat_id`、配置 systemd、验证事件”流程见：[后端完整部署向导](docs/DEPLOYMENT_GUIDE.md)。

最短安装步骤：

```bash
git clone --branch self-hosted https://github.com/SnowBar0v0/fomo-relay-monitor.git
cd fomo-relay-monitor
npm run check
npm test
cp .env.example .env
chmod 600 .env
```

填写 `.env`：

```text
PORT=8787
MONITOR_DATA_DIR=./data
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_IDS=
RELAY_API_KEY=
RELAY_RPM=180
```

启动：

```bash
set -a
. ./.env
set +a
npm start
```

Windows PowerShell 可以在当前会话设置变量后执行 `npm start`，或使用 `server/start-monitor.ps1`。Telegram 规则见：[docs/TELEGRAM_SETUP.md](docs/TELEGRAM_SETUP.md)；VPS、systemd 和 Nginx 参考见：[docs/VPS_DEPLOYMENT.md](docs/VPS_DEPLOYMENT.md)。

## 安装插件

1. 打开 Chrome 或 Edge 的扩展管理页，开启开发者模式。
2. 选择 `加载已解压的扩展程序`，指定仓库的 `extension/` 目录。
3. 点击插件图标，在弹窗填写你自己的后端 API 地址，例如 `http://127.0.0.1:8787` 或你的 HTTPS 反代地址。
4. 点击保存并允许访问该 origin。

插件配置保存在 `chrome.storage.local`。插件不保存 Telegram token、Relay API key，不直接访问 Relay API，也不签名或执行交易。

## API

接口字段和事件格式见：[docs/BACKEND_API_CONTRACT.md](docs/BACKEND_API_CONTRACT.md)。后端必须允许插件跨域读取，并返回 `Access-Control-Allow-Origin: *` 或你的扩展 origin。

## 测试

```bash
npm run check
npm test
```

## 目录

```text
extension/        Chrome/Edge Manifest V3 插件
server/           Telegram 轮询、Relay 查询和只读 HTTP API
tests/extension/  插件测试
server/tests/     后端解析测试
docs/             Telegram、VPS、API 和安装文档
.env.example      脱敏环境变量模板
```
