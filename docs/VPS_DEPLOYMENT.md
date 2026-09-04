# VPS 部署参考

这是通用自部署示例，部署目录、域名、端口和反向代理地址由部署者自行决定。不要使用项目作者的生产配置，也不要把 `.env` 或 `data/` 提交到 Git。

## 安装与启动

要求 Node.js 18 或更高版本：

```bash
git clone --branch self-hosted https://github.com/SnowBar0v0/fomo-relay-monitor.git /opt/fomo-relay-monitor
cd /opt/fomo-relay-monitor
npm run check
npm test
cp .env.example .env
chmod 600 .env
nano .env
```

先在当前 shell 注入 `.env` 中的变量，或使用 systemd 的 `EnvironmentFile`，再启动：

```bash
set -a
. ./.env
set +a
npm start
```

## systemd 示例

将下面的 `User`、`WorkingDirectory` 和 `ExecStart` 改为你的实际部署路径：

```ini
[Unit]
Description=FOMO EVM purchase monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=fomo
WorkingDirectory=/opt/fomo-relay-monitor
EnvironmentFile=/opt/fomo-relay-monitor/.env
ExecStart=/usr/bin/node /opt/fomo-relay-monitor/server/monitor-server.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

保存为 `/etc/systemd/system/fomo-relay-monitor.service` 后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fomo-relay-monitor.service
sudo systemctl status fomo-relay-monitor.service --no-pager
```

## 反向代理参考

Node 后端只监听 `127.0.0.1`。Nginx 只反代只读接口：

```nginx
server {
    listen 80;
    server_name monitor.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

插件中填写反代后的 URL，并按浏览器提示授权该 origin。部署后检查：

```bash
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/api/status
curl -fsS 'http://127.0.0.1:8787/api/events?limit=20'
```
