#!/usr/bin/env bash
# 供 LaunchAgent 每日调用：静默检查，有新版就弹系统通知，不自动安装。
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="${HOME}/.dsh-intel-desktop/state.env"

"${DIR}/dsh-intel-update.sh" --check --quiet
code=$?

if [ "$code" -eq 10 ]; then
  local_ver=""
  remote_ver=""
  if [ -f "$STATE_FILE" ]; then
    # shellcheck disable=SC1090
    . "$STATE_FILE"
    local_ver="${local:-未安装}"
    remote_ver="${remote:-未知}"
  fi
  osascript -e "display notification \"${local_ver} → ${remote_ver}，运行 dsh-intel-update.sh 更新\" with title \"DSH Intel 有新版本\" sound name \"Glass\"" >/dev/null 2>&1 || true
fi

exit 0
