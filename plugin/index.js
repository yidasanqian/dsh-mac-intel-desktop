/**
 * dsh-mac-intel-update — Host half.
 *
 * 桌面版是未签名构建，Electron 内置的更新通道没有 feed（`app-update.yml`
 * 不存在），所以「设置 → 通用」里那条官方「更新渠道」读不到更新源。本插件
 * 用同一位置补一条能用的渠道：固定跟随本仓库（dsh-mac-intel-desktop）的
 * 最新 Release。
 *
 * 流程：
 *   1. 检查：GitHub Releases API 取最新的 `intel-v*` Release，和
 *      `/Applications/DeepSeek Harness.app` 的 CFBundleShortVersionString 比对；
 *      API 不可用时退回 `releases/latest/download/version.txt`。
 *   2. 下载：流式写入 `~/.dsh/dsh-mac-intel-update/downloads/`，按
 *      SHA256SUMS.txt 校验（按哈希比对，不依赖文件名）。
 *   3. 安装：生成一份 root 安装脚本，用 `osascript ... with administrator
 *      privileges` 弹系统授权后以 nohup 分离运行。脚本等应用退出、挂载 dmg、
 *      替换 bundle、清 quarantine、以原用户身份重启应用，并把结果写进
 *      `last-install.json`；下次宿主启动时由界面回执。
 *
 * 安全：只接受本机页面发来的 POST（回环 TCP 对端 + 同名 Host + 无代理头 +
 * sec-fetch-site 为空或 same-origin）。真正动手前还有 macOS 管理员授权这一道
 * 人为确认。
 *
 * @module dsh-mac-intel-update
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 没有 web carrier 就没有路由。 */
export const inject = ['webServer']

const REPO = 'yidasanqian/dsh-mac-intel-desktop'
const APP_NAME = 'DeepSeek Harness'
const APP_PATH = `/Applications/${APP_NAME}.app`
const RELEASE_VERSION_PREFIX = 'intel-v'
const DMG_NAME = 'dsh-mac-intel-latest.dmg'
const LATEST_BASE = `https://github.com/${REPO}/releases/latest/download`
const API_RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=10`
const UA = 'dsh-mac-intel-update/0.1.0'

const ROUTE_PREFIX = '/dsh-mac-intel-update/api'
const ROUTE_STATUS = `${ROUTE_PREFIX}/status`
const ROUTE_CHECK = `${ROUTE_PREFIX}/check`
const ROUTE_DOWNLOAD = `${ROUTE_PREFIX}/download`
const ROUTE_INSTALL = `${ROUTE_PREFIX}/install`
const ROUTE_CHANNEL = `${ROUTE_PREFIX}/channel`

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const STATE_DIR = join(DSH_HOME, 'dsh-mac-intel-update')
const DOWNLOAD_DIR = join(STATE_DIR, 'downloads')
const CACHE_FILE = join(STATE_DIR, 'cache.json')
const CONFIG_FILE = join(STATE_DIR, 'config.json')
const LAST_INSTALL_FILE = join(STATE_DIR, 'last-install.json')
const LOG_FILE = join(STATE_DIR, 'install.log')
/** 可选渠道：`latest` 跟随所有构建，`stable` 只接受正式版本号。 */
const CHANNELS = new Set(['latest', 'stable'])

/** 检查结果缓存；`checking` 只在内存里，不落盘。 */
const EMPTY_CHECK = {
  version: null,
  tag: null,
  publishedAt: null,
  url: null,
  assetUrl: null,
  shaUrl: null,
  size: null,
  source: null,
  channel: 'latest',
  checkedAt: null,
  error: null,
  checking: false,
}

/**
 * @typedef {typeof EMPTY_CHECK} CheckState
 */

/** 下载状态：`idle | downloading | verifying | ready | error`。 */
let download = { phase: 'idle', version: null, percent: 0, receivedBytes: 0, totalBytes: 0, path: null, sha256: null, error: null }
/** 安装交接状态：`idle | scheduled | error`。 */
let install = { phase: 'idle', version: null, startedAt: null, error: null }

let check = { ...EMPTY_CHECK }
/** 用户选择的更新渠道；持久化在 `config.json`。 */
let settings = { channel: 'latest' }
let checkTask = null
let downloadTask = null
let downloadAbort = null
let versionCache = null

/**
 * 读一个 JSON 文件；不存在、损坏、形状不对都回 null。
 * @param {string} file - 文件路径。
 * @returns {Promise<any>} 解析结果。
 */
async function readJson(file) {
  try {
    const text = await fsp.readFile(file, 'utf8')
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * 原子写 JSON：临时文件 + rename，读者要么见旧完整文件、要么见新完整文件。
 * @param {string} file - 文件路径。
 * @param {unknown} value - 要写入的值。
 * @returns {Promise<void>}
 */
async function writeJson(file, value) {
  await fsp.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fsp.rename(tmp, file)
}

/** 带 HTTP 状态码的业务失败。 */
class RouteError extends Error {
  /**
   * @param {number} status - 响应状态码。
   * @param {string} message - 给用户看的原因。
   */
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** 把错误整理成一句能给用户看的话。 */
function messageOf(error) {
  if (error === null || error === undefined) return '未知错误'
  const text = error instanceof Error ? error.message : String(error)
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

/** host 是否跑在 DSH 桌面壳里。 */
function isDesktopHost() {
  return Boolean(process.versions?.electron) || process.env.DSH_SHELL === '1'
}

/**
 * 读已安装应用的版本；优先 plutil，失败时退回 Info.plist 文本解析。
 * @returns {string | null} CFBundleShortVersionString。
 */
function readInstalledVersion() {
  const now = Date.now()
  if (versionCache !== null && now - versionCache.at < 15_000) return versionCache.value
  let value = null
  try {
    value = execFileSync('/usr/bin/plutil', [
      '-extract', 'CFBundleShortVersionString', 'raw', '-o', '-',
      join(APP_PATH, 'Contents/Info.plist'),
    ], { encoding: 'utf8', timeout: 3_000 }).trim() || null
  } catch {
    try {
      const plist = readFileSync(join(APP_PATH, 'Contents/Info.plist'), 'utf8')
      value = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1]?.trim() ?? null
    } catch {
      value = null
    }
  }
  versionCache = { at: now, value }
  return value
}

/**
 * 拆一个能比较的版本号（semver 子集：主版本 + 预发布标识）。
 * @param {string} raw - 版本号，允许前缀 v。
 * @returns {{ major: number, minor: number, patch: number, pre: string[] }} 结构化版本。
 */
function parseVersion(raw) {
  const cleaned = String(raw ?? '').trim().replace(/^v/, '')
  const [core, ...rest] = cleaned.split('-')
  const [major, minor, patch] = core.split('.').map(part => Number.parseInt(part, 10) || 0)
  return { major, minor, patch, pre: rest.length > 0 ? rest.join('-').split('.') : [] }
}

/**
 * 按 semver 优先级比较两个版本。
 * @param {string} left - 左版本。
 * @param {string} right - 右版本。
 * @returns {number} 负数表示 left 更旧，0 相同，正数表示 left 更新。
 */
function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  const length = Math.max(a.pre.length, b.pre.length)
  for (let index = 0; index < length; index += 1) {
    const x = a.pre[index]
    const y = b.pre[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const delta = Number(x) - Number(y)
      if (delta !== 0) return delta < 0 ? -1 : 1
      continue
    }
    if (nx) return -1
    if (ny) return 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * 一个 GitHub Release 是否可用作更新源。
 * @param {any} release - Releases API 的一项。
 * @returns {object | null} 规范化后的发布信息。
 */
function releaseFromApi(release) {
  if (release === null || typeof release !== 'object') return null
  const tag = String(release.tag_name ?? '')
  if (!tag.startsWith(RELEASE_VERSION_PREFIX) || release.draft === true) return null
  const version = tag.slice(RELEASE_VERSION_PREFIX.length)
  if (version === '') return null
  const assets = Array.isArray(release.assets) ? release.assets : []
  const dmg = assets.find(asset => asset?.name === DMG_NAME)
  if (dmg === undefined || typeof dmg.browser_download_url !== 'string') return null
  const sums = assets.find(asset => asset?.name === 'SHA256SUMS.txt')
  return {
    version,
    tag,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    url: typeof release.html_url === 'string' ? release.html_url : `https://github.com/${REPO}/releases/tag/${tag}`,
    assetUrl: dmg.browser_download_url,
    shaUrl: typeof sums?.browser_download_url === 'string' ? sums.browser_download_url : null,
    size: Number.isFinite(dmg.size) ? dmg.size : null,
    source: 'api',
  }
}

/** 拉 Releases API。 */
async function fetchReleases() {
  const response = await fetch(API_RELEASES, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': UA, 'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error('GitHub API 返回格式异常')
  return data
}

/**
 * API 不可用时的兜底：`releases/latest/download/version.txt`。
 * @param {string} channel - `latest` 或 `stable`；正式渠道遇到预发布版本时返回 null。
 * @returns {Promise<object | null>} 规范化后的发布信息。
 */
async function latestFromStatic(channel) {
  const response = await fetch(`${LATEST_BASE}/version.txt`, {
    headers: { 'user-agent': UA, accept: 'text/plain' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const version = (await response.text()).trim()
  if (!/^\d/.test(version)) throw new Error('version.txt 内容异常')
  if (channel === 'stable' && version.includes('-')) return null
  return {
    version,
    tag: `${RELEASE_VERSION_PREFIX}${version}`,
    publishedAt: null,
    url: `https://github.com/${REPO}/releases/latest`,
    assetUrl: `${LATEST_BASE}/${DMG_NAME}`,
    shaUrl: `${LATEST_BASE}/SHA256SUMS.txt`,
    size: null,
    source: 'static',
  }
}

/** 发布是否符合当前渠道：正式渠道只收不带预发布后缀的版本号。 */
function matchesChannel(version, channel) {
  return channel !== 'stable' || !String(version).includes('-')
}

/** 执行一次远端检查（60 秒内的结果直接复用）。 */
async function performCheck() {
  if (checkTask !== null) return checkTask
  const channel = settings.channel
  checkTask = (async () => {
    check = { ...check, channel, checking: true }
    try {
      let release = null
      try {
        const releases = await fetchReleases()
        for (const item of releases) {
          const candidate = releaseFromApi(item)
          if (candidate === null || !matchesChannel(candidate.version, channel)) continue
          if (release === null || compareVersions(candidate.version, release.version) > 0) release = candidate
        }
        if (release === null) {
          if (channel === 'stable') {
            // 正式渠道没有匹配版本不算失败，界面会显示「正式版暂无发布」。
            check = { ...EMPTY_CHECK, channel, checkedAt: new Date().toISOString(), error: null, checking: false }
            await writeJson(CACHE_FILE, check).catch(() => {})
            return
          }
          throw new Error('仓库里还没有 intel-v* Release')
        }
      } catch (apiError) {
        release = await latestFromStatic(channel)
        if (release === null) {
          check = { ...EMPTY_CHECK, channel, checkedAt: new Date().toISOString(), error: null, checking: false }
          await writeJson(CACHE_FILE, check).catch(() => {})
          return
        }
      }
      check = { ...release, channel, checkedAt: new Date().toISOString(), error: null, checking: false }
      await writeJson(CACHE_FILE, check).catch(() => {})
    } catch (error) {
      check = { ...check, channel, checkedAt: new Date().toISOString(), error: messageOf(error), checking: false }
    } finally {
      checkTask = null
    }
  })()
  return checkTask
}

/** 读 SHA256SUMS.txt 里的首个哈希；拿不到回 null。 */
async function fetchExpectedSha(state) {
  if (typeof state.shaUrl !== 'string') return null
  const response = await fetch(state.shaUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) return null
  const text = await response.text()
  const match = /[a-f0-9]{64}/i.exec(text)
  return match === null ? null : match[0].toLowerCase()
}

/**
 * 计算文件 SHA256。
 * @param {string} file - 文件路径。
 * @returns {Promise<string>} 小写十六进制摘要。
 */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** 状态快照；不含网络请求。 */
async function snapshot() {
  const installed = readInstalledVersion()
  const available = installed !== null && check.version !== null && compareVersions(check.version, installed) > 0
  const lastInstall = await readJson(LAST_INSTALL_FILE)
  return {
    ok: true,
    platform: process.platform,
    supported: process.platform === 'darwin' && process.arch === 'x64',
    desktop: isDesktopHost(),
    appPath: APP_PATH,
    appInstalled: installed !== null,
    installedVersion: installed,
    channel: settings.channel,
    channels: [...CHANNELS],
    latest: check.version === null ? null : {
      version: check.version,
      tag: check.tag,
      publishedAt: check.publishedAt,
      url: check.url,
      size: check.size,
      source: check.source,
    },
    updateAvailable: available,
    checkedAt: check.checkedAt,
    checking: check.checking,
    checkError: check.error,
    download: {
      phase: download.phase,
      version: download.version,
      percent: download.percent,
      receivedBytes: download.receivedBytes,
      totalBytes: download.totalBytes,
      error: download.error,
    },
    install: {
      phase: install.phase,
      version: install.version,
      startedAt: install.startedAt,
      error: install.error,
      last: lastInstall !== null && typeof lastInstall.ok === 'boolean' ? lastInstall : null,
    },
    repoUrl: `https://github.com/${REPO}/releases`,
  }
}

/**
 * 后台下载 + 校验；调用方立即拿到 202，后续用 status 轮询进度。
 * @param {string | null} version - 用户确认的版本，必须和当前检查结果一致。
 */
async function startDownload(version) {
  if (process.platform !== 'darwin' || process.arch !== 'x64') throw new RouteError(409, '仅 macOS Intel 可用')
  if (downloadTask !== null) throw new RouteError(409, '已有下载在进行')
  if (check.version === null) throw new RouteError(409, '请先检查更新')
  if (version !== null && version !== undefined && version !== check.version) throw new RouteError(409, '版本信息已变化，请重新检查更新')
  const installed = readInstalledVersion()
  if (installed !== null && compareVersions(check.version, installed) <= 0) throw new RouteError(409, '当前已是最新版本')
  const state = check
  download = { phase: 'downloading', version: state.version, percent: 0, receivedBytes: 0, totalBytes: state.size ?? 0, path: null, sha256: null, error: null }
  const controller = new AbortController()
  downloadAbort = controller
  downloadTask = (async () => {
    const dest = join(DOWNLOAD_DIR, `${DMG_NAME.replace(/\.dmg$/, '')}-${state.version}.dmg`)
    const tmp = `${dest}.part`
    try {
      await fsp.mkdir(DOWNLOAD_DIR, { recursive: true })
      const response = await fetch(state.assetUrl, {
        headers: { 'user-agent': UA, accept: 'application/octet-stream' },
        signal: controller.signal,
      })
      if (!response.ok || response.body === null) throw new Error(`下载失败：HTTP ${response.status}`)
      const total = Number(response.headers.get('content-length')) || state.size || 0
      download.totalBytes = total
      const handle = await fsp.open(tmp, 'w')
      try {
        let received = 0
        for await (const chunk of response.body) {
          await handle.write(chunk)
          received += chunk.length
          download.receivedBytes = received
          download.percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0
        }
      } finally {
        await handle.close()
      }
      download.phase = 'verifying'
      const expected = await fetchExpectedSha(state)
      if (expected === null) throw new Error('远端没有可用的 SHA256SUMS.txt')
      const actual = await sha256File(tmp)
      if (actual !== expected) throw new Error('SHA256 校验不通过，已中止')
      await fsp.rename(tmp, dest)
      // 只保留这一版安装包，历史下载和断点残留一起清掉。
      try {
        const entries = await fsp.readdir(DOWNLOAD_DIR)
        await Promise.all(entries
          .filter(name => (name.endsWith('.dmg') || name.endsWith('.part')) && join(DOWNLOAD_DIR, name) !== dest)
          .map(name => fsp.rm(join(DOWNLOAD_DIR, name), { force: true }).catch(() => {})))
      } catch {
        /* 清理失败不影响本次下载 */
      }
      download = { phase: 'ready', version: state.version, percent: 100, receivedBytes: download.receivedBytes, totalBytes: download.totalBytes, path: dest, sha256: actual, error: null }
    } catch (error) {
      await fsp.rm(tmp, { force: true }).catch(() => {})
      download = {
        phase: 'error',
        version: state.version,
        percent: 0,
        receivedBytes: 0,
        totalBytes: state.size ?? 0,
        path: null,
        sha256: null,
        error: error?.name === 'AbortError' ? '已取消下载' : messageOf(error),
      }
    } finally {
      downloadAbort = null
      downloadTask = null
    }
  })()
  return snapshot()
}

/** bash 单引号字面量。 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/** AppleScript 双引号字符串转义。 */
function appleScriptQuote(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 双引号 shell 字符串转义。 */
function shellDoubleQuote(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
}

/**
 * 生成 root 安装脚本。模板放在 installer.sh 里，方便直接 review 和做
 * `bash -n`；所有需要 sudo 的动作都在这里，由 osascript 以管理员权限分离
 * 运行，所以应用退出不会打断它。
 * @param {{ version: string, dmg: string, resultFile: string, logFile: string }} input - 安装参数。
 * @returns {string} bash 脚本。
 */
function renderInstaller(input) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0
  const gid = typeof process.getgid === 'function' ? process.getgid() : 0
  const template = readFileSync(new URL('./installer.sh', import.meta.url), 'utf8')
  return template
    .replaceAll('@@LOG@@', shellDoubleQuote(input.logFile))
    .replaceAll('@@APP@@', shellDoubleQuote(APP_PATH))
    .replaceAll('@@DMG@@', shellDoubleQuote(input.dmg))
    .replaceAll('@@EXPECT@@', shellDoubleQuote(input.version))
    .replaceAll('@@RESULT@@', shellDoubleQuote(input.resultFile))
    .replaceAll('@@UID@@', String(uid))
    .replaceAll('@@GID@@', String(gid))
}

/**
 * 下载完成后，把安装交给管理员权限的分离脚本。
 */
async function scheduleInstall() {
  if (process.platform !== 'darwin' || process.arch !== 'x64') throw new RouteError(409, '仅 macOS Intel 可用')
  const appInstalled = readInstalledVersion()
  if (appInstalled === null) throw new RouteError(409, `未检测到 ${APP_PATH}`)
  if (download.phase !== 'ready' || download.path === null || download.version === null) throw new RouteError(409, '更新包尚未下载并校验完成')
  if (compareVersions(download.version, appInstalled) <= 0) throw new RouteError(409, '当前已是最新版本')
  if (install.phase === 'scheduled') throw new RouteError(409, '安装已经在进行')
  await fsp.mkdir(STATE_DIR, { recursive: true })
  await fsp.mkdir(DOWNLOAD_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const scriptFile = join(STATE_DIR, `install-${stamp}.sh`)
  await fsp.writeFile(scriptFile, renderInstaller({
    version: download.version,
    dmg: download.path,
    resultFile: LAST_INSTALL_FILE,
    logFile: LOG_FILE,
  }), { mode: 0o755 })
  install = { phase: 'scheduled', version: download.version, startedAt: new Date().toISOString(), error: null }
  const command = `nohup /bin/bash ${shellQuote(scriptFile)} >> ${shellQuote(LOG_FILE)} 2>&1 &`
  const script = `do shell script "${appleScriptQuote(command)}" with administrator privileges`
  let child
  try {
    child = spawn('/usr/bin/osascript', ['-e', script], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) {
    install = { phase: 'error', version: download.version, startedAt: null, error: messageOf(error) }
    throw error
  }
  let stderr = ''
  child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
  child.on('exit', (code) => {
    if (code === 0) return
    // 走到这里说明应用还活着：管理员授权被取消或 osascript 失败。
    install = { phase: 'error', version: download.version, startedAt: null, error: stderr.trim() !== '' ? messageOf(stderr.trim()) : '管理员授权被取消' }
  })
  child.unref()
  return snapshot()
}

/**
 * 只接受本机页面发来的请求：回环 TCP 对端、回环 Host、无代理头，
 * `sec-fetch-site` 为空或 same-origin。
 * @param {import('node:http').IncomingMessage} req - 请求。
 * @returns {boolean} 可信时为 true。
 */
function trustedRequest(req) {
  const address = req.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin') return false
  if (req.headers.forwarded !== undefined
    || req.headers['x-forwarded-for'] !== undefined
    || req.headers['x-real-ip'] !== undefined) return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1'
}

/** 统一 JSON 响应。 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** 包一层：方法校验 + 本机来源校验 + 错误兜底。 */
function handler(method, action) {
  return async (req, res) => {
    if (req.method !== method) {
      res.writeHead(405, { allow: method })
      res.end()
      return
    }
    if (!trustedRequest(req)) {
      sendJson(res, 403, { ok: false, error: '只接受本机页面发来的请求' })
      return
    }
    try {
      await action(req, res)
    } catch (error) {
      sendJson(res, error instanceof RouteError ? error.status : 500, { ok: false, error: messageOf(error) })
    }
  }
}

/** 从 query 里读一个参数。 */
function queryOf(req, name) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  return url.searchParams.get(name)
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - host 上下文。
 */
export function apply(ctx) {
  // 渠道选择和上次检查结果都落盘，重启后先显示缓存，再按需刷新。
  Promise.all([readJson(CONFIG_FILE), readJson(CACHE_FILE)]).then(([saved, cached]) => {
    if (saved !== null && typeof saved.channel === 'string' && CHANNELS.has(saved.channel)) settings = { ...settings, channel: saved.channel }
    if (cached === null) return
    const restored = { ...EMPTY_CHECK, ...cached }
    if (restored.channel !== settings.channel) return
    if (typeof restored.version === 'string' && restored.version !== '') check = { ...restored, checking: false, error: null }
  }).catch(() => {})

  ctx.effect(() => () => {
    downloadAbort?.abort()
    versionCache = null
  }, 'dsh-mac-intel-update: abort pending download')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_STATUS,
    handler: handler('GET', async (_req, res) => {
      sendJson(res, 200, await snapshot())
    }),
  }), 'dsh-mac-intel-update: status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_CHECK,
    handler: handler('POST', async (req, res) => {
      if (queryOf(req, 'refresh') !== '1' && check.checkedAt !== null) {
        const age = Date.now() - Date.parse(check.checkedAt)
        if (Number.isFinite(age) && age < 60_000) {
          sendJson(res, 200, await snapshot())
          return
        }
      }
      await performCheck()
      sendJson(res, 200, await snapshot())
    }),
  }), 'dsh-mac-intel-update: check route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_DOWNLOAD,
    handler: handler('POST', async (req, res) => {
      const version = queryOf(req, 'version')
      const state = await startDownload(version)
      sendJson(res, 202, state)
    }),
  }), 'dsh-mac-intel-update: download route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_CHANNEL,
    handler: handler('POST', async (req, res) => {
      const value = queryOf(req, 'value')
      if (typeof value !== 'string' || !CHANNELS.has(value)) {
        sendJson(res, 400, { ok: false, error: '不支持的更新渠道' })
        return
      }
      if (settings.channel !== value) {
        // 等正在跑的检查结束，避免旧渠道的结果覆盖新选择。
        if (checkTask !== null) await checkTask.catch(() => {})
        settings = { ...settings, channel: value }
        await writeJson(CONFIG_FILE, settings).catch(() => {})
        downloadAbort?.abort()
        downloadAbort = null
        download = { phase: 'idle', version: null, percent: 0, receivedBytes: 0, totalBytes: 0, path: null, sha256: null, error: null }
        install = { phase: 'idle', version: null, startedAt: null, error: null }
        check = { ...EMPTY_CHECK, channel: value }
        await performCheck()
      }
      sendJson(res, 200, await snapshot())
    }),
  }), 'dsh-mac-intel-update: channel route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_INSTALL,
    handler: handler('POST', async (req, res) => {
      const version = queryOf(req, 'version')
      if (download.version !== null && version !== null && version !== download.version) {
        sendJson(res, 409, { ok: false, error: '下载的版本和确认的版本不一致，请重新下载' })
        return
      }
      const state = await scheduleInstall()
      sendJson(res, 202, state)
    }),
  }), 'dsh-mac-intel-update: install route')

  ctx.logger?.('dsh-mac-intel-update')?.info('routes ready at %s', ROUTE_PREFIX)
}
