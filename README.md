# FOMO EVM 买入监控浏览器插件

Chrome/Edge Manifest V3 浏览器插件，用于从用户配置的私有只读 API 读取 EVM 买入事件，并在任意 HTTPS 页面显示悬浮窗。

本公开仓库只包含浏览器插件客户端和后端 API 契约，不包含私有后端服务实现、不包含 Telegram Bot token、不包含频道 ID、不包含 VPS 部署配置。

## 功能

- 在网页右上角显示 FOMO EVM 买入事件浮层。
- 展示备注、目标链、目标代币、到账数量、钱包地址、合约地址、接收地址。
- 支持复制钱包、合约、接收地址。
- 支持拖动、调整尺寸、收起、关闭、从插件弹窗重新显示。
- 在插件弹窗中配置后端 API 地址。
- 仅消费用户配置的私有后端 API，不保存或上传后端密钥。

## 架构

```text
私有后端服务
-> GET /api/events 输出 EVM 买入事件
-> 浏览器插件后台读取 API
-> content.js 在网页悬浮展示
```

公开版不托管后端配置，不接收用户 Telegram token。后端建议由使用者自己私有部署，或由项目所有者在自有 VPS 上维护。

## 安装

1. 下载或克隆本仓库。
2. 打开 Chrome 或 Edge 扩展管理页：

   ```text
   chrome://extensions
   edge://extensions
   ```

3. 开启 `开发者模式`。
4. 点击 `加载已解压的扩展程序`。
5. 选择本项目目录。
6. 点击插件图标，在弹窗中填写后端 API 地址，例如：

   ```text
   https://your-monitor.example.com
   http://127.0.0.1:8787
   ```

7. 点击 `保存配置`，并允许插件访问该后端地址。

详细步骤见：[浏览器插件安装指南](docs/EXTENSION_INSTALL.md)。

## 后端 API 契约

插件需要后端提供只读 HTTP API：

```text
GET /health
GET /api/status
GET /api/events?limit=100
```

字段格式见：[后端 API 契约](docs/BACKEND_API_CONTRACT.md)。

## 项目结构

```text
manifest.json        浏览器扩展配置
background.js        扩展后台，请求用户配置的只读后端事件
content.js           页面悬浮窗 UI
popup.html           插件弹窗
popup.js             插件弹窗逻辑和后端地址配置
popup.css            插件弹窗样式
monitor-config.js    后端地址校验、路径拼接与权限匹配
relay-core.js        事件数据格式化
tests/               客户端单元测试
docs/                安装、API 契约、开发需求文档
```

## 开发

Node.js 18 或更高版本。

```bash
npm run check
npm test
```

当前基线：

```text
JS 语法检查：通过
Node 测试：通过
```

## 安全边界

- 插件不保存 Telegram token。
- 插件不保存 Relay API key。
- 插件不读取 Cookie、钱包凭据或私钥。
- 插件不签名交易。
- 插件不执行自动买卖。
- 后端地址由用户在插件弹窗手动配置。
- 公开仓库不包含私有后端服务代码。

## 开发需求

如果需要继续开发私有后端或调整公开插件，见：[开发需求文档](docs/DEVELOPER_REQUIREMENTS.md)。
