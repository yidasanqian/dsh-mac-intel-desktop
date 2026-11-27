#!/usr/bin/env bash
# 安装/卸载「每日检查更新」的 LaunchAgent。
#
#   ./install-agent.sh              安装（每天 19:00 检查一次）
#   ./install-agent.sh --uninstall  卸载
set -euo pipefail

LABEL="com.yidasanqian.dsh-mac-intel-watch"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
# 旧标签（仓库改名前的 dsh-intel-watch），安装/卸载时一并清掉
LEGACY_LABEL="com.yidasanqian.dsh-intel-watch"
LEGACY_PLIST="${HOME}/Library/LaunchAgents/${LEGACY_LABEL}.plist"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCH="${DIR}/dsh-mac-intel-watch.sh"
STATE_DIR="${HOME}/.dsh-mac-intel-desktop"

drop_legacy() {
  launchctl bootout "gui/$(id -u)/${LEGACY_LABEL}" >/dev/null 2>&1 || true
  rm -f "$LEGACY_PLIST"
}

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
  rm -f "$PLIST"
  drop_legacy
  echo "已卸载 ${LABEL}"
  exit 0
fi

chmod +x "${DIR}/dsh-mac-intel-update.sh" "$WATCH"
mkdir -p "${HOME}/Library/LaunchAgents" "$STATE_DIR"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${WATCH}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>19</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${STATE_DIR}/watch.log</string>
  <key>StandardErrorPath</key>
  <string>${STATE_DIR}/watch.log</string>
</dict>
</plist>
PLIST_EOF

drop_legacy
launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true

echo "已安装 ${LABEL}，每天 19:00 检查一次"
echo "立即试跑一次：bash ${WATCH} && cat ${STATE_DIR}/state.env"
