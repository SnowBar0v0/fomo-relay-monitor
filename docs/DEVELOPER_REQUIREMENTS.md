# 开发需求

`self-hosted` 分支提供浏览器插件和脱敏后的 Node 后端。每个用户必须在自己的本机或 VPS 部署后端、创建自己的 Telegram Bot，并配置自己的频道或群。

Telegram token、Relay API key、频道 ID、钱包私钥和运行数据不得交给项目作者或其它第三方，也不得提交 Git。

## 插件端

1. 使用 Chrome/Edge Manifest V3。
2. 在弹窗中填写后端 API 地址。
3. 使用 `chrome.storage.local` 保存地址。
4. 保存时使用 `chrome.permissions.request` 请求后端 origin 权限。
5. 只访问用户配置后端的 `/health`、`/api/status` 和 `/api/events?limit=100`。
6. 不保存 Telegram token、Relay API key 或钱包私钥。

## 后端端

后端实现位于 `server/`，负责：

- 通过 Telegram Bot API 读取频道帖子、群消息和编辑消息。
- 从文本或隐藏链接提取 Relay、Solscan 和 EVM explorer 交易线索。
- 查询 Relay 并识别目标链、目标代币、到账数量、合约地址和接收地址。
- 通过只读 HTTP API 输出事件。

必须提供：

```text
GET /health
GET /api/status
GET /api/events?limit=100
```

## Telegram 消息适配

理论上所有监控 Bot 都可以接入，只要推送文本或隐藏链接中包含：

- Relay transaction 链接。
- Solscan `/tx/` 链接。
- Etherscan、Basescan 或 Blockscout 的 EVM `/tx/0x...` 链接。
- 明文 EVM 交易哈希。
- 带 `tx`、`hash`、`交易` 或 `签名` 标签的 Solana 签名。
- Relay/跨链提示和钱包地址，用于按时间窗口回查。

备注解析规则可以按监控 Bot 文案扩展，但不能影响核心交易识别。

## 发布安全

公开仓库可以包含脱敏后的 `server/`，但不能包含：

- `.env` 或 `data/`。
- 真实 Telegram token、频道 ID 或 Bot 名称。
- 真实 Relay API key。
- 生产 VPS IP、私有部署路径或生产运行数据。

提交前执行：

```bash
npm run check
npm test
```

详细配置见 `docs/TELEGRAM_SETUP.md`、`docs/VPS_DEPLOYMENT.md` 和 `docs/BACKEND_API_CONTRACT.md`。
