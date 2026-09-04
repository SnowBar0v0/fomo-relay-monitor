# Telegram 接入指南

后端使用 Telegram Bot API 的 `getUpdates` 读取频道帖子、群消息及编辑消息。它只读取消息并查询 Relay，不发送交易、不保存钱包私钥。

## 创建 Bot

1. 在 Telegram 搜索 `@BotFather`，发送 `/newbot`。
2. 按提示创建 Bot，并把 token 只保存到你自己的部署环境。
3. 不要把 token 提交 Git、发给项目作者或放进浏览器插件。token 如果泄露，立即在 BotFather 使用 `/revoke`。

## 加入频道或群

频道：将 Bot 添加为频道管理员，使其可以接收 `channel_post`。通常不需要发言权限。

群或超级群：将 Bot 加入群。若需要读取普通群内的全部消息，在 BotFather 使用 `/setprivacy` 对该 Bot 选择 `Disable`，或者将 Bot 设为管理员。

监控 Bot 的消息可以是转发消息、频道帖子或人工转发，只要文本或隐藏链接含有以下任一线索：

- `relay.link/transaction/...` 或 `relay.link/tx/...`
- `solscan.io/tx/...`
- Etherscan、Basescan、Blockscout 的 EVM 交易链接
- 明文 EVM 交易哈希
- 标记为 `tx`、`hash`、`交易` 或 `签名` 的 Solana 交易签名
- Relay/跨链提示加钱包地址，用于按消息时间窗口匹配

## 获取 chat_id

方法一：启动后端，在目标频道或群发送一条测试消息，然后查看：

```bash
curl -fsS http://127.0.0.1:8787/api/status
```

读取 `telegram.lastUpdateChatId`、`telegram.lastUpdateChatTitle` 和 `telegram.lastUpdateChatType`。

方法二：直接调用 Telegram Bot API：

```bash
curl -sS 'https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates?allowed_updates=["message","channel_post","edited_message","edited_channel_post"]'
```

在 `result[].message.chat.id` 或 `result[].channel_post.chat.id` 中找到 ID。频道和超级群通常以 `-100` 开头。

## 配置

复制 `.env.example` 为 `.env`，填写：

```text
PORT=8787
MONITOR_DATA_DIR=./data
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_IDS=一个或多个chat_id，逗号分隔
RELAY_API_KEY=
RELAY_RPM=180
```

同一个 Bot token 只能有一个 `getUpdates` 轮询实例。若出现 `Conflict: terminated by other getUpdates request`，停止其它实例后再启动本后端。
