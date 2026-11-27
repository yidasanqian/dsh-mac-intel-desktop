# dsh-mac-intel-desktop

**中文** | [English](README.en.md)

**DSH Mac Desktop · Intel（x86_64）版** — 给 **Mac Intel** 机器用的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）桌面版构建与分发，附轻量更新器。

上游 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 官方桌面版只发 `macos-arm64.dmg`，官网下载页对 Intel 机型直接提示「Intel 芯片暂不支持」。这个仓库做一件事：从上游源码 tag 在 GitHub Actions 的 Intel 机器上构建 x86_64 包，发布到这里，并配一个轻量更新器。

**非官方项目。** 不改上游源码，只做编译与分发。

## 下载安装

1. 打开 [Releases](https://github.com/yidasanqian/dsh-mac-intel-desktop/releases/latest)，下载 `dsh-mac-intel-latest.dmg`
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
curl -fsSL https://raw.githubusercontent.com/yidasanqian/dsh-mac-intel-desktop/main/updater/dsh-mac-intel-update.sh -o /tmp/dsh-mac-intel-update.sh
chmod +x /tmp/dsh-mac-intel-update.sh && /tmp/dsh-mac-intel-update.sh

# 只检查，不下载
/tmp/dsh-mac-intel-update.sh --check
```

脚本做的事：读最新 Release 的 `version.txt`，和 `/Applications/DeepSeek Harness.app` 的 `CFBundleShortVersionString` 比对，有差异就下载 dmg、校验 SHA256、挂载、退出正在运行的 app、替换 bundle、清 quarantine。

产物名跟随仓库：`dsh-mac-intel-latest.dmg`。仓库改名之前发布的旧 Release 里叫 `dsh-intel-latest.dmg`，脚本会自动兜底，不用手动处理。

### 桌面端插件（推荐）

不想开终端的话，这个仓库带一个 DSH 插件，把更新入口放进 **设置 → 通用**：

- 位置：[`plugin/`](plugin/)（DSH bundle，host + client 两半）
- 安装：DSH → 插件 → 添加插件 → 选择仓库里的 `plugin` 目录。装好后 **设置 → 通用** 会出现「更新渠道 · Mac Intel」一行
- 行为：默认跟随本仓库最新构建（含上游 `rc` / `alpha`），行内下拉可切到「仅正式版」跳过预发布（当前上游还没发正式版，选中会显示「正式版暂无发布」）；「检查更新」比对 app 的 `CFBundleShortVersionString`，有新版本时「下载更新」拉 dmg 并按 `SHA256SUMS.txt` 校验，「安装并重启」弹 macOS 管理员授权，退出应用、替换 `/Applications` 里的 bundle、清 quarantine、自动重启
- 下载缓存和日志在 `~/.dsh/dsh-mac-intel-update/`，上次安装结果写在 `last-install.json`，重启后界面会显示回执
- 它和下面的脚本读同一个 Release，装不装插件互不影响；插件只是图形化入口

注意：安装仍然需要管理员授权（写 `/Applications`），插件不会绕过系统弹窗。

想让它每天自动提醒（不自动装，避免 sudo 静默提权）：

```sh
git clone https://github.com/yidasanqian/dsh-mac-intel-desktop.git
cd dsh-mac-intel-desktop
./updater/install-agent.sh          # 每天 19:00 检查，有新版弹通知
./updater/install-agent.sh --uninstall
```

已有旧版定时任务的话，重跑一次 `install-agent.sh` 就会覆盖成新时间。

## 版本策略

- 跟随上游 `dsh-v*` tag，包含 `-rc` / `-alpha` 预发布版本（上游目前只发这类）
- [sync.yml](.github/workflows/sync.yml) 每 2 小时查一次上游新 tag，发现未发布版本就派发 [build.yml](.github/workflows/build.yml) 构建。昂贵的 Intel runner 只在真有新版时启动，push 不会触发任何构建
- Release 里的 `version.txt` 就是上游 `package.json` 的版本号，和 app 的 `CFBundleShortVersionString` 一致
- 每个 Release 附 `source.txt`：上游 repo、tag、解析后的 commit SHA、本次构建的 run 链接。tag 名里的版本号对齐上游，但 git tag 指向本仓库，不导入上游历史
- 上游发新版到这里的包出现，通常延迟 1–4 小时（轮询间隔 + 构建耗时）

## 构建

每一步都在 Actions 里公开可查：[build.yml](.github/workflows/build.yml)

```
macos-15-intel runner
  → checkout 上游 tag
  → pnpm install --frozen-lockfile
  → pnpm run package:desktop:mac:x64:unsigned
  → 产出 dmg，重命名为 dsh-mac-intel-latest.dmg
  → 发布 Release（含 version.txt / SHA256SUMS.txt）
```

手动构建任意版本：Actions → Build macOS Intel DMG → Run workflow，`source_ref` 填 `dsh-v0.2.2-rc.5` 这类 tag。

## 已知限制

- **未签名、未公证**。每次构建 ad-hoc 签名都不同。企业 MDM 环境可能直接拒绝运行。
- **没有 Electron 自动更新**：用上面的插件或脚本，写 `/Applications` 仍需要管理员授权。
- 每次构建约 45–90 分钟，Intel runner 只有 14 GB 磁盘，上游体积再涨可能构建失败（工作流里有磁盘探针，失败时看日志）。
- 只出 dmg，没有 zip，也没有增量更新。
- 上游是 developer preview，兼容性会断，插件可能随版本失效。

## 许可与商标

- 本仓库的构建脚本：MIT，见 [LICENSE](LICENSE)
- 打包进去的上游代码：MIT，版权归 DeepSeek，见 [NOTICE](NOTICE)
- "DeepSeek Harness" 是 DeepSeek 的注册商标。本项目名使用官方允许的 "DSH" 缩写，不使用全称，也不代表官方认可。
