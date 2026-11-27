# dsh-intel-desktop

[中文](README.md) | **English**

x86_64 (Intel) macOS builds of the DSH desktop app, plus a lightweight updater.

The upstream [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) publishes desktop builds for `macos-arm64` only; its download page tells Intel users the chip is not supported. This repo does exactly one thing: build the x86_64 DMG from upstream source tags on GitHub Actions' Intel runner, publish it here, and ship a small update script.

**Unofficial.** No upstream code is modified — build and distribution only.

## Install

1. Grab `dsh-intel-latest.dmg` from [Releases](https://github.com/yidasanqian/dsh-intel-desktop/releases/latest)
2. Mount it and drag `DeepSeek Harness.app` into `/Applications`
3. Strip the quarantine flag before the first launch (the bundle is ad-hoc signed, Gatekeeper blocks it otherwise):

```sh
sudo xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"
```

Verify the download:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

Requirements: macOS 13+, Intel CPU.

## Updating

The bundle is not signed with an Apple Developer certificate, so Electron's built-in auto-update is unavailable — upstream's build script writes no update feed in `unsigned` mode. A standalone script fills the gap:

```sh
# check and install (interactive confirmation)
curl -fsSL https://raw.githubusercontent.com/yidasanqian/dsh-intel-desktop/main/updater/dsh-intel-update.sh -o /tmp/dsh-intel-update.sh
chmod +x /tmp/dsh-intel-update.sh && /tmp/dsh-intel-update.sh

# check only, no download
/tmp/dsh-intel-update.sh --check
```

What it does: reads `version.txt` from the latest release, compares it against `CFBundleShortVersionString` of `/Applications/DeepSeek Harness.app`, and on mismatch downloads the DMG, verifies SHA256, mounts, quits the running app, swaps the bundle, then clears quarantine.

To get a daily reminder (notify only — no silent `sudo` installs):

```sh
git clone https://github.com/yidasanqian/dsh-intel-desktop.git
cd dsh-intel-desktop
./updater/install-agent.sh          # checks daily at 19:00, posts a notification when a new build exists
./updater/install-agent.sh --uninstall
```

Already running an older schedule? Re-run `install-agent.sh` and it overwrites the LaunchAgent with the new time.

## Versioning

- Follows upstream `dsh-v*` tags, including `-rc` / `-alpha` prereleases (that is all upstream ships today)
- Checks upstream for new tags daily at 20:00 UTC, then builds and publishes `intel-v<version>`
- `version.txt` in each release is the upstream `package.json` version, identical to the app's `CFBundleShortVersionString`
- Each release ships `source.txt`: upstream repo, tag, resolved commit SHA, and the build run URL. The tag name tracks upstream, but the git tag itself points at this repo — upstream history is never imported
- Expect a 1–2 hour lag between an upstream release and the build appearing here

## Building

Every step is public in Actions: [build.yml](.github/workflows/build.yml)

```
macos-15-intel runner
  → checkout upstream tag
  → pnpm install --frozen-lockfile
  → pnpm run package:desktop:mac:x64:unsigned
  → rename the DMG to dsh-intel-latest.dmg
  → publish release (with version.txt / SHA256SUMS.txt)
```

To build a specific version: Actions → Build macOS Intel DMG → Run workflow, put a tag like `dsh-v0.2.2-rc.5` in `source_ref`.

## Known limitations

- **Unsigned and un-notarized.** Every build gets a different ad-hoc signature. Corporate MDM setups may refuse to run it outright.
- **No Electron auto-update** — only the script above, and it needs `sudo` to write `/Applications`.
- Builds take 45–90 minutes. The Intel runner has 14 GB of disk; if upstream keeps growing, builds will fail (the workflow logs disk usage, check the log).
- DMG only — no zip, no delta updates.
- Upstream is a developer preview. Compatibility breaks, and plugins may stop working across versions.

## License and trademarks

- Build scripts in this repo: MIT, see [LICENSE](LICENSE)
- Bundled upstream code: MIT, copyright DeepSeek, see [NOTICE](NOTICE)
- "DeepSeek Harness" is a DeepSeek trademark. This project uses the "DSH" abbreviation, makes no claim of official endorsement, and is not affiliated with DeepSeek.
