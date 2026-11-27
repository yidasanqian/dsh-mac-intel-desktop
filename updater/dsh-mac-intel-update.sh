#!/usr/bin/env bash
# dsh-mac-intel-desktop 更新器（Mac Intel / 未签名构建专用）
#
#   ./dsh-mac-intel-update.sh            检查并安装最新版（交互确认）
#   ./dsh-mac-intel-update.sh --check    只检查，不下载
#   ./dsh-mac-intel-update.sh --quiet    静默模式，供 LaunchAgent 调用
#   ./dsh-mac-intel-update.sh --yes      跳过确认，直接安装
#
# 退出码：0 已是最新或安装成功，10 有新版本（仅 --check），1 出错
set -euo pipefail

REPO="yidasanqian/dsh-mac-intel-desktop"
APP_NAME="DeepSeek Harness"
APP_PATH="/Applications/${APP_NAME}.app"
BASE="https://github.com/${REPO}/releases/latest/download"
ASSET="dsh-mac-intel-latest.dmg"
STATE_DIR="${HOME}/.dsh-mac-intel-desktop"
STATE_FILE="${STATE_DIR}/state.env"

CHECK_ONLY=0
QUIET=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --quiet) QUIET=1 ;;
    --yes)   ASSUME_YES=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg" >&2; exit 1 ;;
  esac
done

mkdir -p "$STATE_DIR"
log() { [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"; }
die() { printf '错误：%s\n' "$*" >&2; exit 1; }

local_version() {
  if [ -d "$APP_PATH" ]; then
    defaults read "${APP_PATH}/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo ''
  else
    echo ''
  fi
}

remote_version() {
  local raw
  raw="$(curl -fsSL --max-time 20 "${BASE}/version.txt" 2>/dev/null)" || return 1
  printf '%s' "$raw" | tr -d '[:space:]'
}

LOCAL_VER="$(local_version)"
REMOTE_VER="$(remote_version)" || die "取不到远端版本号：网络不通，或该 Release 尚未发布（${BASE}/version.txt）"
[ -n "$REMOTE_VER" ] || die "远端版本号为空"

# 记录一次检查时间，供 watch 脚本判断
printf 'last_check=%s\nremote=%s\nlocal=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$REMOTE_VER" "$LOCAL_VER" > "$STATE_FILE"

if [ -z "$LOCAL_VER" ]; then
  log "未检测到已安装的 ${APP_NAME}，将执行全新安装：${REMOTE_VER}"
  NEED_ACTION=install
elif [ "$LOCAL_VER" = "$REMOTE_VER" ]; then
  log "已是最新版本：${LOCAL_VER}"
  exit 0
else
  log "发现新版本：${LOCAL_VER} → ${REMOTE_VER}"
  NEED_ACTION=update
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  exit 10
fi

if [ "$ASSUME_YES" -eq 0 ]; then
  printf '是否继续%s？[y/N] ' "$([ "$NEED_ACTION" = install ] && echo 安装 || echo 更新)"
  read -r reply </dev/tty || reply='n'
  case "$reply" in y|Y|yes|YES) ;; *) log '已取消'; exit 0 ;; esac
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/dsh-mac-intel.XXXXXX")"
MNT="${WORK}/mnt"
DMG="${WORK}/${ASSET}"
MOUNTED=0
cleanup() {
  [ "$MOUNTED" -eq 1 ] && hdiutil detach "$MNT" -quiet -force >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

log '下载 dmg…'
curl -fL --progress-bar --max-time 1800 -o "$DMG" "${BASE}/${ASSET}" || die '下载失败'

log '校验 SHA256…'
if curl -fsSL --max-time 20 -o "${WORK}/SHA256SUMS.txt" "${BASE}/SHA256SUMS.txt"; then
  # 按哈希比对，不依赖文件名
  expected="$(awk 'length($1) == 64 { print $1; exit }' "${WORK}/SHA256SUMS.txt")"
  actual="$(shasum -a 256 "$DMG" | awk '{ print $1 }')"
  [ -n "$expected" ] || die 'SHA256SUMS.txt 内容无法解析'
  [ "$expected" = "$actual" ] || die "SHA256 校验不通过（期望 ${expected}，实际 ${actual}），已中止"
else
  log '远端未提供 SHA256SUMS.txt，跳过校验'
fi

mkdir -p "$MNT"
hdiutil attach -nobrowse -quiet -mountpoint "$MNT" "$DMG" || die '挂载 dmg 失败'
MOUNTED=1
[ -d "${MNT}/${APP_NAME}.app" ] || die "dmg 内未找到 ${APP_NAME}.app"

# 运行中的 app 会占用 bundle，替换前先退出
if pgrep -f "${APP_PATH}/Contents/MacOS" >/dev/null 2>&1; then
  log '正在退出运行中的应用…'
  osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -f "${APP_PATH}/Contents/MacOS" >/dev/null 2>&1 || break
    sleep 1
  done
  pkill -f "${APP_PATH}/Contents/MacOS" >/dev/null 2>&1 || true
fi

log '写入 /Applications（需要管理员权限）…'
sudo rm -rf "$APP_PATH"
sudo ditto "${MNT}/${APP_NAME}.app" "$APP_PATH"
# 未签名构建带 quarantine 会被 Gatekeeper 拦，装完即清
sudo xattr -dr com.apple.quarantine "$APP_PATH" >/dev/null 2>&1 || true

NEW_VER="$(local_version)"
[ "$NEW_VER" = "$REMOTE_VER" ] || die "写入后版本仍是 ${NEW_VER}，期望 ${REMOTE_VER}"
log "完成，当前版本 ${NEW_VER}"

if [ "$QUIET" -eq 0 ]; then
  open -a "$APP_PATH" >/dev/null 2>&1 || true
fi
