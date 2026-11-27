# dsh-mac-intel-update

DSH 桌面版插件，给 [dsh-mac-intel-desktop](https://github.com/yidasanqian/dsh-mac-intel-desktop) 的未签名 Intel 构建补一个可用的更新入口。

## 它做什么

在 **设置 → 通用** 里新增一行「更新渠道 · Mac Intel」：

- 默认跟随本仓库（`yidasanqian/dsh-mac-intel-desktop`）的最新 Release，包含上游 `rc` / `alpha` 预发布；行内下拉可切到「仅正式版」，只接受不带预发布后缀的版本（当前上游还没发正式版，会显示「正式版暂无发布」）
- 「检查更新」把最新版本和 `/Applications/DeepSeek Harness.app` 的 `CFBundleShortVersionString` 比对
- 「下载更新」把 dmg 流式下载到 `~/.dsh/dsh-mac-intel-update/downloads/`，并按 Release 的 `SHA256SUMS.txt` 校验
- 「安装并重启」弹 macOS 管理员授权，跑一个分离的 root 脚本：退出应用 → 挂载 dmg → 替换 `/Applications` 里的 bundle → 清 quarantine → 以原用户身份重启
- 上次安装结果写进 `~/.dsh/dsh-mac-intel-update/last-install.json`，重启后界面显示回执

## 为什么需要它

这份 Intel 构建是 ad-hoc 签名、没有公证，上游打包脚本在 `unsigned` 模式下不写 `app-update.yml`，所以 Electron 内置更新通道和原生「更新渠道」都没有更新源。插件用 GitHub Releases 作为替代 feed。

## 安装

DSH → 插件 → 添加插件 → 选择本目录。装好后打开 **设置 → 通用**。

## 安全边界

- 四个路由只接受本机页面转发来的请求（回环 TCP 对端、回环 Host、无代理头、`sec-fetch-site` 为空或 `same-origin`）
- 真正写 `/Applications` 前一定有 macOS 管理员授权弹窗，插件不绕过系统确认
- 检查走公开的 GitHub API，不发送任何本机信息
- 插件停用或删除后，官方「更新渠道」那一行保持原样，脚本和 LaunchAgent 不受影响

## 卸载

DSH → 插件 → 移除本插件。已下载的 dmg 和日志可以手动删除：`rm -rf ~/.dsh/dsh-mac-intel-update`。
