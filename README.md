# dsh-intel-desktop

**中文** | [English](README.en.md)

给 **Intel Mac**（x86_64）用的 DSH 桌面版构建与分发。

上游 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 官方桌面版只发 `macos-arm64.dmg`，官网下载页对 Intel 机型直接提示「Intel 芯片暂不支持」。这个仓库做一件事：从上游源码 tag 在 GitHub Actions 的 Intel 机器上构建 x86_64 包，发布到这里，并配一个轻量更新器。

**非官方项目。** 不改上游源码，只做编译与分发。

## 下载安装

1. 打开 [Releases](https://github.com/yidasanqian/dsh-intel-desktop/releases/latest)，下载 `dsh-intel-latest.dmg`
2. 双击挂载，把 `DeepSeek Harness.app` 拖进「应用程序」
3. 首次打开前清掉隔离属性（包是 ad-hoc 签名，不清会被 Gatekeeper 拦）：

```sh
sudo xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"
```

校验安装包完整性：

```sh
shasum -a 256 -c SHA256SUMS.txt
```

系统要求：macOS 13+，Intel 处理器。

## 更新

包没有 Apple Developer 签名，所以 Electron 内置的自动更新通道不可用（上游构建脚本在 `unsigned` 模式下根本不写更新源）。这里用一个独立脚本代替：

```sh
# 检查并安装（交互确认）
curl -fsSL https://raw.githubusercontent.com/yidasanqian/dsh-intel-desktop/main/updater/dsh-intel-update.sh -o /tmp/dsh-intel-update.sh
chmod +x /tmp/dsh-intel-update.sh && /tmp/dsh-intel-update.sh

# 只检查，不下载
/tmp/dsh-intel-update.sh --check
```

脚本做的事：读最新 Release 的 `version.txt`，和 `/Applications/DeepSeek Harness.app` 的 `CFBundleShortVersionString` 比对，有差异就下载 dmg、校验 SHA256、挂载、退出正在运行的 app、替换 bundle、清 quarantine。

想让它每天自动提醒（不自动装，避免 sudo 静默提权）：

```sh
git clone https://github.com/yidasanqian/dsh-intel-desktop.git
cd dsh-intel-desktop
./updater/install-agent.sh          # 每天 19:00 检查，有新版弹通知
./updater/install-agent.sh --uninstall
```

已有旧版定时任务的话，重跑一次 `install-agent.sh` 就会覆盖成新时间。

## 版本策略

- 跟随上游 `dsh-v*` tag，包含 `-rc` / `-alpha` 预发布版本（上游目前只发这类）
- 每天 20:00 UTC 自动检查上游新 tag，有新版就构建并发布 `intel-v<版本>`
- Release 里的 `version.txt` 就是上游 `package.json` 的版本号，和 app 的 `CFBundleShortVersionString` 一致
- 上游发新版到这里的包出现，通常延迟 1–2 小时（构建耗时）

## 构建

每一步都在 Actions 里公开可查：[build.yml](.github/workflows/build.yml)

```
macos-15-intel runner
  → checkout 上游 tag
  → pnpm install --frozen-lockfile
  → pnpm run package:desktop:mac:x64:unsigned
  → 产出 dmg，重命名为 dsh-intel-latest.dmg
  → 发布 Release（含 version.txt / SHA256SUMS.txt）
```

手动构建任意版本：Actions → Build macOS Intel DMG → Run workflow，`source_ref` 填 `dsh-v0.2.2-rc.5` 这类 tag。

## 已知限制

- **未签名、未公证**。每次构建 ad-hoc 签名都不同。企业 MDM 环境可能直接拒绝运行。
- **没有 Electron 自动更新**，只有上面那个脚本，需要 sudo 才能写 `/Applications`。
- 每次构建约 45–90 分钟，Intel runner 只有 14 GB 磁盘，上游体积再涨可能构建失败（工作流里有磁盘探针，失败时看日志）。
- 只出 dmg，没有 zip，也没有增量更新。
- 上游是 developer preview，兼容性会断，插件可能随版本失效。

## 许可与商标

- 本仓库的构建脚本：MIT，见 [LICENSE](LICENSE)
- 打包进去的上游代码：MIT，版权归 DeepSeek，见 [NOTICE](NOTICE)
- "DeepSeek Harness" 是 DeepSeek 的注册商标。本项目名使用官方允许的 "DSH" 缩写，不使用全称，也不代表官方认可。
