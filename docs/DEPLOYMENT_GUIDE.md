# 后端完整部署向导

本项目需要三个 Telegram 角色：

| 角色 | 作用 | 是否需要 token 写入后端 |
| --- | --- | --- |
| 后端 Bot | 由你通过 BotFather 创建，读取目标频道帖子 | 是，写入 `TELEGRAM_BOT_TOKEN` |
| 监控推送 Bot | 你已有的 FOMO/钱包监控 Bot，向目标频道发布信号 | 否 |
| 目标频道 | 由你建立，作为监控消息汇总入口 | ID 写入 `TELEGRAM_CHAT_IDS` |

最终链路是：

```text
监控推送 Bot -> 目标 Telegram 频道 -> 后端 Bot -> Relay 查询 -> 浏览器插件
```

后端 Bot 和监控推送 Bot 不是同一个 token。后端只需要自己的 Bot token；监控推送 Bot 只需要能够向目标频道发布或转发消息。

## 1. 准备 VPS

要求 Node.js 18 或更高版本。以下命令中的 `/opt/fomo-relay-monitor` 可以替换成你的实际目录：

```bash
git clone --branch self-hosted https://github.com/SnowBar0v0/fomo-relay-monitor.git /opt/fomo-relay-monitor
cd /opt/fomo-relay-monitor
npm run check
npm test
cp .env.example .env
chmod 600 .env
```

如果仓库已经存在，改用：

```bash
cd /opt/fomo-relay-monitor
git pull origin self-hosted
```

## 2. 创建后端 Bot

1. 在 Telegram 搜索 `@BotFather`。
2. 发送 `/newbot`，按提示设置名称和用户名。
3. 保存 BotFather 返回的 token。
4. token 只写入你自己的 VPS `.env`，不要发给项目作者、不要放入插件、不要提交 Git。

如果 token 曾经泄露，在 BotFather 使用 `/revoke` 重新生成。

## 3. 建立目标频道

建议建立一个私有频道，专门接收 FOMO 监控消息：

1. 新建 Telegram 频道。
2. 将刚才创建的后端 Bot 添加为频道管理员。
3. 将已有的监控推送 Bot 添加到同一频道。
4. 确认监控推送 Bot 具有发布消息权限；后端 Bot 具有读取频道帖子的权限。

后端读取的是 Telegram `channel_post` 更新，因此后端 Bot 必须实际加入目标频道。仅知道频道链接、但没有把 Bot 加入频道，后端无法读取帖子。

## 4. 首次填写配置并获取 chat_id

先编辑 `.env`，暂时只填写后端 Bot token，`TELEGRAM_CHAT_IDS` 留空：

```text
PORT=8787
MONITOR_DATA_DIR=./data
TELEGRAM_BOT_TOKEN=在这里填写后端Bot的token
TELEGRAM_CHAT_IDS=
RELAY_API_KEY=
RELAY_RPM=180
```

此时空的 `TELEGRAM_CHAT_IDS` 只用于首次发现频道 ID。发现后必须马上填写白名单并重启，避免后端接收不相关聊天的消息。

## 可选：FOMO swaps 补全

默认不需要 FOMO 登录凭据。若监控消息本身带有明确的 FOMO 用户句柄（例如 `FOMO用户: @handle`、`userHandle: handle`）或 `fomo.family/profile/<handle>` 隐藏链接，可以在自有 VPS 的 `.env` 追加以下变量，让后端在 Relay 哈希查询为空或仍处于处理中时，用 `swaps` 做一次时间窗口校验和目标代币补全：

```text
FOMO_ACCESS_TOKEN=只放在自有VPS的短期access token
FOMO_REFRESH_TOKEN=只放在自有VPS的refresh token
FOMO_SWAPS_LIMIT=50
```

这三项不写入 `.env.example`，也不提交 Git。后端只在内存中自动刷新 access token，不把 FOMO 凭据写入 `data/`；重启服务需要重新提供当前有效的两个 token。该备用路径只接受 `provider=RELAY` 的买入记录，不使用聚合 Feed，也不能把只有钱包地址的消息可靠映射到 FOMO 用户。若 FOMO API 返回鉴权或风控错误，Relay 主路径仍继续工作。

启动一次前台实例：

```bash
cd /opt/fomo-relay-monitor
set -a
. ./.env
set +a
npm start
```

保持该 SSH 窗口运行，再打开第二个 SSH 窗口。让监控推送 Bot 向目标频道发布一条包含以下任意线索的测试消息：

- Relay 交易链接；
- Solscan 交易链接；
- EVM explorer 交易链接；
- 明文交易哈希；
- 带 Relay/跨链提示的钱包地址。

然后在第二个 SSH 窗口查看：

```bash
curl -fsS http://127.0.0.1:8787/api/status
```

从返回值读取：

```text
telegram.lastUpdateChatId
telegram.lastUpdateChatTitle
telegram.lastUpdateChatType
```

其中 `telegram.lastUpdateChatId` 就是目标频道的 `chat_id`。频道 ID 通常以 `-100` 开头。不要凭频道用户名猜 ID。

停止前台实例后，把实际 ID 写回 `.env`：

```text
TELEGRAM_CHAT_IDS=你的目标频道chat_id
```

多个频道或群用逗号分隔：

```text
TELEGRAM_CHAT_IDS=频道chat_id1,频道chat_id2
```

也可以不用前台启动，直接用 Bot API 的 `getUpdates` 找 `channel_post.chat.id`；但使用上面的临时空白白名单方式更容易验证后端 Bot 是否真的收到了频道帖子。

## 5. 配置为 systemd 常驻服务

将下面内容保存为 `/etc/systemd/system/fomo-relay-monitor.service`，把路径和 Node 路径替换成实际值：

```ini
[Unit]
Description=FOMO EVM purchase monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/fomo-relay-monitor
EnvironmentFile=/opt/fomo-relay-monitor/.env
ExecStart=/usr/bin/node /opt/fomo-relay-monitor/server/monitor-server.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

如果 `node` 不在 `/usr/bin/node`，先执行 `command -v node` 并替换 `ExecStart`。然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fomo-relay-monitor.service
sudo systemctl status fomo-relay-monitor.service --no-pager
```

同一个后端 Bot token 只能由一个进程调用 `getUpdates`。完成 systemd 配置后，关闭前台实例，不要再启动第二份后端。

## 6. 验证 Telegram 和事件

确认 `.env` 已经填写真实频道 ID 后，执行：

```bash
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/api/status
curl -fsS 'http://127.0.0.1:8787/api/events?limit=20'
```

`/api/status` 至少应满足：

```text
ok=true
telegram.configured=true
telegram.connected=true
telegram.chatAccessible=true
```

`chatChecks` 中应出现目标频道，并且 `ok=true`。然后让监控推送 Bot 发送真实监控消息，事件会在 Relay 查询完成后出现在 `/api/events`。

## 7. 配置浏览器插件

1. 加载仓库中的 `extension/` 目录。
2. 打开插件弹窗。
3. 填写后端 API 地址。若 Node 只监听本机，则填写本机地址；若部署在 VPS，填写 Nginx 反代后的 HTTPS 地址。
4. 点击保存并允许插件访问该 origin。

插件只请求：

```text
GET /health
GET /api/status
GET /api/events?limit=100
```

插件不接收 Telegram token、Relay API key，也不直接读取 Telegram。

## 常见错误

### `chatAccessible=false`

通常是后端 Bot 没加入目标频道、权限不足，或 `.env` 中的 ID 填错。重新添加后端 Bot 为频道管理员，确认 `TELEGRAM_CHAT_IDS` 是 `channel_post.chat.id`。

### 能收到频道消息但没有事件

确认测试消息中包含 Relay、Solscan、EVM 交易链接、交易哈希，或包含 Relay/跨链提示和钱包地址。只有普通文本不会触发 Relay 查询。

### `Conflict: terminated by other getUpdates request`

同一个后端 Bot token 被多个后端实例使用。停止其它实例，只保留 systemd 服务这一份。

### 服务状态正常但浏览器读不到

检查 Nginx 反代、CORS 和防火墙。后端应允许跨域 GET，并返回：

```text
Access-Control-Allow-Origin: *
Cache-Control: no-store
```
