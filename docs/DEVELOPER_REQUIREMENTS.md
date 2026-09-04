# 开发需求文档

## 结论

当前公开 GitHub 仓库只保留浏览器插件客户端。私有后端继续部署在自有 VPS，不把后端实现、Telegram Bot token、频道 ID、VPS IP、运行数据提交到公开仓库。

不建议做“公开用户把 Telegram token 上传到你的 VPS 后端”的方案。原因是这会变成多用户密钥托管，需要账号体系、权限隔离、审计、限流、滥用处理和数据删除能力，当前自用项目没有必要引入这些复杂度。

## 目标架构

```text
Telegram 监控 Bot/频道
-> 私有 VPS 后端读取 TG 消息
-> 私有 VPS 后端解析 Relay/Solscan/EVM tx
-> 私有 VPS 后端输出只读 API
-> 公开浏览器插件配置 API 地址后展示事件
```

## 插件端需求

1. 插件必须是 Chrome/Edge Manifest V3。
2. 插件弹窗提供 `后端 API 地址` 输入框。
3. 配置保存到 `chrome.storage.local`。
4. 保存配置时通过 `chrome.permissions.request` 请求该后端 origin 权限。
5. 插件不硬编码任何生产 VPS IP、频道 ID、Telegram Bot 名称。
6. 插件不保存 Telegram token、Relay API key、钱包私钥。
7. 插件只访问用户配置的私有后端只读接口：

   ```text
   <后端 API 地址>/health
   <后端 API 地址>/api/status
   <后端 API 地址>/api/events?limit=100
   ```

8. 后端未配置时，插件明确提示用户先配置 API 地址。

## 后端端需求

后端不进入当前公开仓库。私有后端需要保持以下只读接口：

```text
GET /health
GET /api/status
GET /api/events?limit=100
```

返回格式按：

```text
docs/BACKEND_API_CONTRACT.md
```

## Telegram 监控源适配要求

理论上所有监控 Bot 都可以接入，前提是它推送到频道或群里的消息包含可解析线索：

- Relay transaction 链接。
- Solscan `/tx/` 链接。
- Etherscan、Basescan、Blockscout 的 `/tx/0x...` 链接。
- 明文 EVM tx hash。
- 标注为 `tx`、`hash`、`交易`、`签名` 的 Solana 签名。
- 带 Relay/跨链提示的钱包地址，作为时间窗口回查备用路径。

备注名可以按具体监控 Bot 文案继续补规则，但不应影响核心交易识别。

## 发布要求

公开 GitHub 仓库不能包含：

- 后端服务实现文件。
- `.env`。
- `data/`。
- Telegram Bot token。
- Telegram 频道 ID。
- 生产 VPS IP。
- Relay API key。
- 私有部署路径。

提交前必须执行：

```bash
npm run check
npm test
```

当前预期：

```text
JS 语法检查通过
relay-core 客户端测试通过
```

## 可选后续

如果未来要给外部用户完整自部署，可以另开一个后端仓库或 `server/` 包，并先完成：

- 脱敏配置模板。
- Docker Compose。
- systemd 示例。
- 反代示例。
- Telegram Bot 创建指南。
- 明确 license。
- API 鉴权方案。
