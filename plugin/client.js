/**
 * dsh-mac-intel-update — Client half.
 *
 * 在「设置 → 通用」里占用官方那条读不到更新源的 `desktop-update-channel`
 * 一行，换成能用的渠道：固定跟随本仓库最新 Release。检查、下载、安装都由
 * host 半的 HTTP 路由完成，这里只做展示和触发。
 *
 * 不 import 任何 Harness Client 包：React 从模块表拿，样式自己注入，
 * 颜色只用 `--dsw-alias-*` 主题 token。
 */
window.__ModuleLoader__.load({
  id: 'dsh-mac-intel-update',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dshMacIntelUpdate'
    const ROUTE = '/dsh-mac-intel-update/api'
    const SLOT = 'settings.general.item'
    const ROW_ID = 'dsh-mac-intel-update'

    const zh = {
      'row.title': '更新渠道 · Mac Intel',
      'row.description': '跟随本仓库最新 Release；切到「仅正式版」可跳过上游 rc / alpha 预发布。官方渠道在这份未签名构建里没有更新源。',
      'row.channel.latest': '最新构建',
      'row.channel.stable': '仅正式版',
      'row.channel.switch': '切换更新渠道',
      'state.checking': '正在检查更新…',
      'state.current': '当前 {version}',
      'state.latest': '最新 {version}',
      'state.upToDate': '已是最新',
      'state.noStable': '正式版暂无发布',
      'state.updateAvailable': '有新版本 {version}',
      'state.checkFailed': '检查失败：{message}',
      'state.unsupported': '仅 macOS Intel 桌面版可用',
      'state.appMissing': '未检测到 /Applications/DeepSeek Harness.app',
      'state.downloading': '正在下载 {percent}%',
      'state.verifying': '正在校验 SHA256…',
      'state.downloadReady': '已下载并校验 {version}',
      'state.downloadFailed': '下载失败：{message}',
      'state.installing': '已请求管理员授权，应用即将退出并更新…',
      'state.installFailed': '安装未开始：{message}',
      'state.lastInstallOk': '上次更新成功：{version}',
      'state.lastInstallFail': '上次更新失败：{message}',
      'action.check': '检查更新',
      'action.download': '下载更新',
      'action.install': '安装并重启',
      'action.retry': '重试下载',
      'hint.install': '会先退出应用，再替换 /Applications 里的 bundle。',
      'hint.size': '安装包约 {size}',
    }

    const en = {
      'row.title': 'Update channel · Mac Intel',
      'row.description': 'Follows the newest release in this repository. Switch to Stable only to skip upstream rc / alpha prereleases. The official channel has no update feed in this unsigned build.',
      'row.channel.latest': 'Latest build',
      'row.channel.stable': 'Stable only',
      'row.channel.switch': 'Switch update channel',
      'state.checking': 'Checking for updates…',
      'state.current': 'Current {version}',
      'state.latest': 'Latest {version}',
      'state.upToDate': 'Up to date',
      'state.noStable': 'No stable release yet',
      'state.updateAvailable': 'Update {version} available',
      'state.checkFailed': 'Check failed: {message}',
      'state.unsupported': 'Available only in the macOS Intel desktop app',
      'state.appMissing': '/Applications/DeepSeek Harness.app was not found',
      'state.downloading': 'Downloading {percent}%',
      'state.verifying': 'Verifying SHA256…',
      'state.downloadReady': 'Downloaded and verified {version}',
      'state.downloadFailed': 'Download failed: {message}',
      'state.installing': 'Administrator approval requested; the app will quit and update…',
      'state.installFailed': 'Installation did not start: {message}',
      'state.lastInstallOk': 'Last update installed {version}',
      'state.lastInstallFail': 'Last update failed: {message}',
      'action.check': 'Check for updates',
      'action.download': 'Download update',
      'action.install': 'Install and restart',
      'action.retry': 'Retry download',
      'hint.install': 'Quits the app, replaces the bundle in /Applications, then relaunches.',
      'hint.size': 'Install package about {size}',
    }

    const CSS = `
.dmiu-row{display:flex;flex-direction:column;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.dmiu-head{display:flex;align-items:flex-start;gap:8px}
.dmiu-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding-right:48px}
@media (max-width:767px){.dmiu-text{padding-right:16px}}
.dmiu-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
.dmiu-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dmiu-select{position:relative;flex:none}
.dmiu-select-button{display:inline-flex;align-items:center;gap:12px;height:36px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;white-space:nowrap}
.dmiu-select-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}
.dmiu-select-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dmiu-select-button:disabled{opacity:.55;cursor:default}
.dmiu-chevron{width:12px;height:12px;flex:none}
.dmiu-menu{position:fixed;z-index:80;min-width:176px;padding:4px;display:flex;flex-direction:column;gap:2px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 28px rgba(0,0,0,.24)}
.dmiu-menu-item{display:flex;align-items:center;justify-content:space-between;gap:16px;height:34px;padding:0 10px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;cursor:pointer;text-align:left;white-space:nowrap}
.dmiu-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}
.dmiu-menu-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dmiu-menu-item[aria-selected="true"]{color:var(--dsw-alias-brand-primary)}
.dmiu-check{width:14px;height:14px;flex:none}
.dmiu-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);min-height:18px}
.dmiu-dot{opacity:.45}
.dmiu-state-ok{color:var(--dsw-alias-state-success-primary)}
.dmiu-state-warn{color:var(--dsw-alias-state-warn-primary)}
.dmiu-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dmiu-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.dmiu-btn{height:28px;padding:0 12px;border-radius:var(--dsw-radius-md,6px);border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dmiu-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dmiu-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dmiu-btn:disabled{opacity:.5;cursor:default}
.dmiu-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}
.dmiu-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.06)}
.dmiu-progress{flex:1 1 160px;min-width:120px;height:4px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dmiu-progress>span{display:block;height:100%;background:var(--dsw-alias-brand-primary);transition:width .25s ease}
.dmiu-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
`

    /** 本地兜底翻译：没有 locale 服务时也能读。 */
    function interpolate(text, params) {
      if (params === undefined || params === null) return text
      return text.replace(/\{(\w+)\}/g, (whole, key) => (key in params ? String(params[key]) : whole))
    }

    function makeTranslate(t) {
      return (key, params) => {
        if (typeof t === 'function') {
          const text = t(key, params)
          if (typeof text === 'string' && text !== key) return text
        }
        const dict = document.documentElement.lang?.startsWith('zh') === true ? zh : en
        return interpolate(dict[key] ?? en[key] ?? key, params)
      }
    }

    async function request(path, options) {
      const response = await fetch(path, { credentials: 'same-origin', ...options })
      let body = null
      try { body = await response.json() } catch { body = null }
      if (!response.ok) throw new Error(body !== null && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
      return body
    }

    const fetchStatus = () => request(`${ROUTE}/status`)
    const runCheck = () => request(`${ROUTE}/check?refresh=1`, { method: 'POST' })
    const startDownload = version => request(`${ROUTE}/download?version=${encodeURIComponent(version)}`, { method: 'POST' })
    const startInstall = version => request(`${ROUTE}/install?version=${encodeURIComponent(version)}`, { method: 'POST' })
    const switchChannel = channel => request(`${ROUTE}/channel?value=${encodeURIComponent(channel)}`, { method: 'POST' })

    function formatBytes(size) {
      if (!Number.isFinite(size) || size <= 0) return ''
      const mb = size / (1024 * 1024)
      return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
    }

    function needsCheck(state) {
      if (state === null) return true
      if (state.checking === true) return true
      if (state.checkedAt === null || state.checkedAt === undefined) return true
      const at = Date.parse(state.checkedAt)
      return !Number.isFinite(at) || Date.now() - at > 10 * 60 * 1000
    }

    const CHEVRON = () => h('svg', { className: 'dmiu-chevron', viewBox: '0 0 12 12', 'aria-hidden': true },
      h('path', { d: 'M2.5 4.5 6 8l3.5-3.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
    const CHECK = () => h('svg', { className: 'dmiu-check', viewBox: '0 0 14 14', 'aria-hidden': true },
      h('path', { d: 'M2.5 7.5 5.6 10.6 11.5 4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))

    /**
     * 渠道下拉。用固定定位渲染菜单，避免被设置面板的滚动容器裁掉；
     * 不依赖 Harness 的 Menu 原语（第三方插件不要 import 它们）。
     */
    function ChannelSelect({ value, channels, disabled, label, ariaLabel, optionLabel, onChange }) {
      const [open, setOpen] = React.useState(false)
      const [position, setPosition] = React.useState(null)
      const buttonRef = React.useRef(null)
      const menuRef = React.useRef(null)

      const place = () => {
        const rect = buttonRef.current?.getBoundingClientRect()
        if (rect === undefined || rect === null) return
        const menuHeight = 4 + channels.length * 34 + 8
        const below = rect.bottom + 6
        setPosition({
          top: Math.round(below + menuHeight > window.innerHeight ? Math.max(8, rect.top - 6 - menuHeight) : below),
          right: Math.max(8, Math.round(window.innerWidth - rect.right)),
        })
      }

      const toggle = () => {
        if (disabled) return
        if (open) { setOpen(false); return }
        place()
        setOpen(true)
      }

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (menuRef.current?.contains(target) === true || buttonRef.current?.contains(target) === true) return
          setOpen(false)
        }
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false) }
        const onScroll = () => setOpen(false)
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        window.addEventListener('scroll', onScroll, true)
        return () => {
          document.removeEventListener('mousedown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('scroll', onScroll, true)
        }
      }, [open])

      return h('div', { className: 'dmiu-select' },
        h('button', {
          ref: buttonRef,
          type: 'button',
          className: 'dmiu-select-button',
          disabled,
          'aria-label': ariaLabel,
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
          onClick: toggle,
        }, h('span', null, label), CHEVRON()),
        open && position !== null
          ? h('div', {
            ref: menuRef,
            className: 'dmiu-menu',
            role: 'listbox',
            'aria-label': ariaLabel,
            style: { top: `${position.top}px`, right: `${position.right}px` },
          }, channels.map(channel => h('button', {
            key: channel,
            type: 'button',
            role: 'option',
            'aria-selected': channel === value,
            className: 'dmiu-menu-item',
            onClick: () => {
              setOpen(false)
              if (channel !== value) onChange(channel)
            },
          }, h('span', null, optionLabel(channel)), channel === value ? CHECK() : null)))
          : null)
    }

    function UpdateChannelRow(props) {
      const t = makeTranslate(props.t)
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const alive = React.useRef(true)

      React.useEffect(() => () => { alive.current = false }, [])

      const commit = (next) => {
        if (alive.current && next !== null && typeof next === 'object') setState(next)
      }

      React.useEffect(() => {
        let cancelled = false
        const load = async () => {
          try {
            const first = await fetchStatus()
            if (cancelled) return
            commit(first)
            if (needsCheck(first) && first.supported === true) {
              const checked = await runCheck()
              if (!cancelled) commit(checked)
            }
          } catch (loadError) {
            if (!cancelled) setError(String(loadError?.message ?? loadError))
          }
        }
        void load()
        return () => { cancelled = true }
      }, [])

      const phase = state?.download?.phase
      const installPhase = state?.install?.phase

      React.useEffect(() => {
        if (phase !== 'downloading' && phase !== 'verifying' && installPhase !== 'scheduled') return undefined
        const timer = setInterval(() => {
          fetchStatus().then(commit).catch(() => {})
        }, 1000)
        return () => clearInterval(timer)
      }, [phase, installPhase])

      const run = async (label, operation) => {
        if (busy !== '') return
        setBusy(label)
        setError('')
        try {
          commit(await operation())
        } catch (operationError) {
          if (alive.current) setError(String(operationError?.message ?? operationError))
        } finally {
          if (alive.current) setBusy('')
        }
      }

      const installed = state?.installedVersion ?? null
      const latest = state?.latest?.version ?? null
      const updateAvailable = state?.updateAvailable === true
      const downloading = phase === 'downloading'
      const verifying = phase === 'verifying'
      const ready = phase === 'ready' && state?.download?.version !== null && state?.download?.version === latest
      const scheduled = installPhase === 'scheduled'
      const supported = state?.supported !== false
      const appInstalled = state?.appInstalled !== false
      const channel = state?.channel ?? 'latest'
      const channels = Array.isArray(state?.channels) && state.channels.length > 0 ? state.channels : ['latest']

      let statusText = ''
      let stateTone = ''
      if (state === null) statusText = t('state.checking')
      else if (!supported) statusText = t('state.unsupported')
      else if (!appInstalled) statusText = t('state.appMissing')
      else if (state.checking === true) statusText = t('state.checking')
      else if (state.checkError !== null && state.checkError !== undefined) statusText = t('state.checkFailed', { message: state.checkError })
      else if (latest === null && channel === 'stable' && state.checkedAt !== null) statusText = t('state.noStable')
      else if (updateAvailable) {
        statusText = t('state.updateAvailable', { version: latest })
        stateTone = 'dmiu-state-warn'
      } else if (latest !== null && installed !== null) {
        statusText = t('state.upToDate')
        stateTone = 'dmiu-state-ok'
      }

      let progress = null
      if (downloading) {
        statusText = t('state.downloading', { percent: state.download.percent ?? 0 })
        progress = h('div', { key: 'progress', className: 'dmiu-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': state.download.percent ?? 0 },
          h('span', { style: { width: `${Math.max(2, state.download.percent ?? 0)}%` } }))
      } else if (verifying) {
        statusText = t('state.verifying')
      } else if (ready) {
        statusText = t('state.downloadReady', { version: latest })
      } else if (phase === 'error' && typeof state?.download?.error === 'string') {
        statusText = t('state.downloadFailed', { message: state.download.error })
      } else if (scheduled) {
        statusText = t('state.installing')
      } else if (installPhase === 'error' && typeof state?.install?.error === 'string') {
        statusText = t('state.installFailed', { message: state.install.error })
      }

      const last = state?.install?.last ?? null
      const lastRecent = last !== null && typeof last.at === 'string' && Date.now() - Date.parse(last.at) < 30 * 60 * 1000
      const lastLine = lastRecent
        ? (last.ok === true ? t('state.lastInstallOk', { version: last.version ?? '' }) : t('state.lastInstallFail', { message: last.message ?? '' }))
        : ''

      const canCheck = busy === '' && state !== null && supported && !downloading && !verifying && !scheduled && state.checking !== true
      const canDownload = busy === '' && supported && updateAvailable && !scheduled
        && (phase === 'idle' || phase === 'error' || (phase === 'ready' && !ready))
      const canInstall = busy === '' && supported && ready && !scheduled
      const canSwitch = busy === '' && state !== null && supported && !downloading && !verifying && !scheduled

      const actions = [
        h('button', {
          key: 'check', type: 'button', className: 'dmiu-btn', disabled: !canCheck,
          onClick: () => { void run('check', runCheck) },
        }, busy === 'check' ? t('state.checking') : t('action.check')),
      ]
      if (canDownload) {
        actions.push(h('button', {
          key: 'download', type: 'button', className: 'dmiu-btn dmiu-btn-primary', disabled: !canDownload,
          onClick: () => { void run('download', () => startDownload(latest)) },
        }, phase === 'error' ? t('action.retry') : t('action.download')))
      }
      if (downloading || verifying) {
        if (progress !== null) actions.push(progress)
      }
      if (ready) {
        actions.push(h('button', {
          key: 'install', type: 'button', className: 'dmiu-btn dmiu-btn-primary', disabled: !canInstall,
          onClick: () => { void run('install', () => startInstall(latest)) },
        }, t('action.install')))
      }

      const meta = []
      if (installed !== null) meta.push(h('span', { key: 'current' }, t('state.current', { version: installed })))
      if (latest !== null) {
        if (meta.length > 0) meta.push(h('span', { key: 'dot', className: 'dmiu-dot', 'aria-hidden': true }, '·'))
        meta.push(h('span', { key: 'latest' }, t('state.latest', { version: latest })))
      }
      if (statusText !== '') {
        if (meta.length > 0) meta.push(h('span', { key: 'dot2', className: 'dmiu-dot', 'aria-hidden': true }, '·'))
        meta.push(h('span', { key: 'status', className: stateTone, role: 'status' }, statusText))
      }

      const hint = ready
        ? h('div', { className: 'dmiu-hint' }, t('hint.install'))
        : updateAvailable && phase === 'idle' && state?.latest?.size
          ? h('div', { className: 'dmiu-hint' }, t('hint.size', { size: formatBytes(state.latest.size) }))
          : null

      return h('div', { className: 'dmiu-row', role: 'group', 'aria-label': t('row.title') },
        h('div', { className: 'dmiu-head' },
          h('div', { className: 'dmiu-text' },
            h('div', { className: 'dmiu-title' }, t('row.title')),
            h('div', { className: 'dmiu-desc' }, t('row.description'))),
          h(ChannelSelect, {
            value: channel,
            channels,
            disabled: !canSwitch,
            label: t(`row.channel.${channel}`),
            ariaLabel: t('row.channel.switch'),
            optionLabel: id => t(`row.channel.${id}`),
            onChange: id => { void run('channel', () => switchChannel(id)) },
          })),
        meta.length > 0 ? h('div', { className: 'dmiu-meta' }, meta) : null,
        lastLine !== '' ? h('div', { className: 'dmiu-meta' }, h('span', { className: last.ok === true ? 'dmiu-state-ok' : 'dmiu-error' }, lastLine)) : null,
        error !== '' ? h('div', { className: 'dmiu-error', role: 'alert' }, error) : null,
        h('div', { className: 'dmiu-actions' }, actions),
        hint)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const disposeStyle = ctx.effect(() => {
          const tag = document.createElement('style')
          tag.setAttribute('data-dsh-plugin', 'dsh-mac-intel-update')
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => { tag.remove() }
        }, 'dsh-mac-intel-update: styles')

        const disposeLocale = ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mac-intel-update: dictionaries')

        const disposeSlot = ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: ROW_ID,
          order: 94,
          locale: NS,
        }, UpdateChannelRow))

        ctx.effect(() => () => { disposeStyle(); disposeLocale(); disposeSlot() }, 'dsh-mac-intel-update: cleanup')
      },
    }
  },
})
