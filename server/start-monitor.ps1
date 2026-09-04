$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $env:TELEGRAM_BOT_TOKEN) {
  throw '请先在当前 PowerShell 会话设置 TELEGRAM_BOT_TOKEN；脚本不会保存或内置 token。'
}

if (-not $env:TELEGRAM_CHAT_IDS) {
  throw '请先在当前 PowerShell 会话设置 TELEGRAM_CHAT_IDS。'
}

if (-not $env:PORT) { $env:PORT = '8787' }
if (-not $env:MONITOR_DATA_DIR) { $env:MONITOR_DATA_DIR = Join-Path $projectRoot '..\data' }

Set-Location -LiteralPath $projectRoot
& node (Join-Path $projectRoot 'monitor-server.js')
