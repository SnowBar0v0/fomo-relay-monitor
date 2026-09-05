# 后端 API 契约

## 范围

本公开仓库只要求后端提供只读 API。后端可以部署在自有 VPS、本机或内网服务中。

插件不会直接接收 Telegram token、Relay API key、钱包私钥或交易权限。

## 端点

### GET /health

用于健康检查。

```json
{
  "ok": true
}
```

### GET /api/status

用于插件弹窗显示连接状态。

```json
{
  "ok": true,
  "events": 12,
  "mode": "telegram-hash-first",
  "relaySource": "v2-hash",
  "fomo": {
    "configured": false,
    "enabled": false,
    "lookupCount": 0,
    "matchCount": 0,
    "lastError": ""
  },
  "telegram": {
    "configured": true,
    "connected": true,
    "chatAccessible": true,
    "lastError": "",
    "chatError": ""
  }
}
```

### GET /api/events?limit=100

用于返回最近 Relay 买入事件。

```json
{
  "ok": true,
  "events": [
    {
      "id": "relay-request-id",
      "remark": "wallet label",
      "user": "0x0000000000000000000000000000000000000000",
      "recipient": "0x0000000000000000000000000000000000000000",
      "createdAt": "2026-09-04T00:00:00.000Z",
      "updatedAt": "2026-09-04T00:00:10.000Z",
      "isSuccessful": true,
      "isPurchase": true,
      "outputAmount": "123.45",
      "input": {
        "amountFormatted": "100",
        "symbol": "USDC"
      },
      "output": {
        "chainId": "8453",
        "chainName": "Base",
        "address": "0x0000000000000000000000000000000000000000",
        "symbol": "TOKEN",
        "name": "Token"
      }
    }
  ],
  "service": {
    "mode": "telegram-hash-first",
    "relaySource": "v2-hash",
    "fomo": {
      "configured": false,
      "enabled": false
    }
  }
}
```

当后端私有配置了 FOMO 凭据且消息包含明确 FOMO 句柄或主页链接时，`mode` 会变为 `telegram-hash-first+fomo-swaps-fallback`，并可能出现 `monitorSource: "fomo-swaps"`。FOMO token 不属于本契约输入，插件永远不会接收它。

## 最低字段要求

插件展示一条买入事件至少需要：

```text
id
remark 或 user
user
createdAt 或 updatedAt
input.amountFormatted
input.symbol
output.symbol
output.chainId 或 output.chainName
output.address
outputAmount
isSuccessful
```

缺少字段时插件会降级显示 `未知代币`、`未确认` 或空地址。

## CORS

后端需要允许浏览器插件发起跨域 GET 请求：

```text
Access-Control-Allow-Origin: *
Cache-Control: no-store
```

如果后端要加鉴权，建议用短 token 或反代 Basic Auth，但需要同步扩展端支持请求头。本公开版默认不带鉴权请求头。

## 错误格式

建议统一返回：

```json
{
  "ok": false,
  "error": "readable error message"
}
```
