import type { EngineInterface, Register } from 'claude-code'

const DEFAULT_SECONDS = 30
const TITLE = 'Claude Code'
// Windows PowerShell's own AppUserModelID: a script can raise a toast under
// it without registering an app of its own.
const APP_ID =
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

type Settings = { isOn: boolean; seconds: number }

const readSettings = async ($: EngineInterface): Promise<Settings> => {
  const seconds = Number((await $.store.get('seconds')) ?? DEFAULT_SECONDS)

  return {
    isOn: (await $.store.get('isOn')) !== false,
    seconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_SECONDS,
  }
}

export const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes === 0) return `${seconds}s`

  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

// The first words of the answer, markdown marks dropped, on one line.
const snippet = (answer: string) => {
  const flat = answer
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat
}

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)

// `powershell -EncodedCommand` takes the script as base64 of UTF-16LE: no
// command-line quoting to get wrong, and non-ASCII letters arrive intact.
export const encodeCommand = (script: string) => {
  const bytes: number[] = []
  for (let i = 0; i < script.length; i++) {
    const unit = script.charCodeAt(i)
    bytes.push(unit & 0xff, unit >> 8)
  }

  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += BASE64.charAt((n >> 18) & 63)
    out += BASE64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? BASE64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? BASE64.charAt(n & 63) : '='
  }

  return out
}

// Each step runs on its own, so one that fails leaves the others, and prints
// its name to stdout once done.
const step = (name: string, lines: readonly string[]) => [
  'try {',
  ...lines.map(line => `  ${line}`),
  `  '${name}'`,
  `} catch { [Console]::Error.WriteLine('${name}: ' + $_) }`,
]

// A toast reaches the notification center, but some machines never show it
// as a banner; the taskbar flash and the sound say it there too.
export const signalScript = (title: string, body: string) => {
  const xml =
    `<toast><visual><binding template="ToastGeneric">` +
    `<text>${escapeXml(title)}</text><text>${escapeXml(body)}</text>` +
    `</binding></visual><audio silent="true"/></toast>`

  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    ...step('toast', [
      '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
      '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
      '$doc = New-Object Windows.Data.Xml.Dom.XmlDocument',
      `$doc.LoadXml('${xml.replace(/'/g, "''")}')`,
      '$toast = New-Object Windows.UI.Notifications.ToastNotification $doc',
      `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${APP_ID}').Show($toast)`,
    ]),
    // The terminal is the first ancestor that owns a window (WezTerm,
    // Windows Terminal, VS Code); it flashes until it comes to the front.
    ...step('flash', [
      `Add-Type -Namespace DoneNotify -Name Win -MemberDefinition '[StructLayout(LayoutKind.Sequential)] public struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; } [DllImport("user32.dll")] public static extern bool FlashWindowEx(ref FLASHWINFO pwfi);'`,
      '$procId = $PID; $hwnd = [IntPtr]::Zero',
      'for ($i = 0; $i -lt 12 -and $hwnd -eq [IntPtr]::Zero; $i++) {',
      '  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId"',
      '  if (-not $p) { break }',
      '  $procId = $p.ParentProcessId',
      '  $gp = Get-Process -Id $procId -ErrorAction SilentlyContinue',
      '  if (-not $gp) { break }',
      '  if ($gp.MainWindowHandle -ne [IntPtr]::Zero) { $hwnd = $gp.MainWindowHandle }',
      '}',
      "if ($hwnd -eq [IntPtr]::Zero) { throw 'no terminal window found' }",
      '$info = New-Object DoneNotify.Win+FLASHWINFO',
      '$info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)',
      // FLASHW_ALL (3) | FLASHW_TIMERNOFG (12)
      '$info.hwnd = $hwnd; $info.dwFlags = 15',
      '[DoneNotify.Win]::FlashWindowEx([ref]$info) | Out-Null',
    ]),
    ...step('sound', [
      "$wav = Join-Path $env:WINDIR 'Media\\Windows Notify System Generic.wav'",
      '(New-Object Media.SoundPlayer $wav).PlaySync()',
    ]),
  ].join('\n')
}

const SIGNALS: Readonly<Record<string, string>> = {
  toast: 'notification center',
  flash: 'taskbar',
  sound: 'sound',
}

// Windows first (toast, taskbar flash, sound), then the person's terminal
// channel, then an in-app toast; resolves what carried it.
const notify = async ($: EngineInterface, isWindows: boolean, body: string) => {
  if (isWindows) {
    try {
      const ran = await $.process.run(
        [
          'powershell.exe',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encodeCommand(signalScript(TITLE, body)),
        ],
        { timeoutMs: 20000 },
      )
      if (ran.stderr.trim() !== '') {
        $.ui.log(`signals: ${ran.stderr.slice(0, 500)}`, { to: 'debug' })
      }
      const sent = ran.stdout
        .split(/\r?\n/)
        .map(line => SIGNALS[line.trim()])
        .filter((label): label is string => label !== undefined)
      if (sent.length > 0) return sent.join(', ')
    } catch (error) {
      $.ui.log(`signals failed: ${String(error)}`, { to: 'debug' })
    }
  }

  try {
    const sent = await $.ui.notify(body, { title: TITLE })
    if (sent.isSent) return `terminal (${sent.channel})`
  } catch {
    // An in-app toast below still says it.
  }

  $.ui.toast(body)

  return 'in-app toast'
}

const bodyFor = (reason: string, durationMs: number, answer: string) => {
  const took = formatDuration(durationMs)
  if (reason === 'error') return `Stopped with an error (${took})`
  if (reason === 'refusal') return `Could not answer (${took})`
  const said = snippet(answer)

  return said === '' ? `Done (${took})` : `Done (${took}): ${said}`
}

const USAGE = 'Usage: /done-notify [on|off|test|<seconds>]'

export const register: Register = on => {
  let isWindows = false

  on('session.start', async ($, e, next) => {
    isWindows = /^([A-Za-z]:[\\/]|\\\\)/.test(e.cwd)
    await $.command.register({
      name: 'done-notify',
      description: 'Turn the done notification on or off, set its threshold, or test it',
      argumentHint: '[on|off|test|<seconds>]',
      immediate: true,
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // Subagents' turns and the person's own interrupts need no call-back.
    if (e.agentId !== undefined || e.isAborted) return done

    const settings = await readSettings($)
    if (!settings.isOn || e.durationMs < settings.seconds * 1000) return done

    const body = bodyFor(e.reason, e.durationMs, e.answer)
    // Raised from a timer so the turn ends without waiting on PowerShell.
    $.clock.after(0, () => void notify($, isWindows, body))

    return done
  })

  on('command.run', { command: 'done-notify' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const settings = await readSettings($)

    if (arg === '') {
      const state = settings.isOn ? 'on' : 'off'
      return {
        text: `Done notification is ${state}; it fires for turns longer than ${settings.seconds}s.\n${USAGE}`,
      }
    }

    if (arg === 'on') {
      await $.store.set('isOn', true)
      return { text: `Done notification on (threshold ${settings.seconds}s).` }
    }

    if (arg === 'off') {
      await $.store.set('isOn', false)
      return { text: 'Done notification off.' }
    }

    if (arg === 'test') {
      const via = await notify($, isWindows, 'Test: done-notify works.')
      return { text: `Test notification sent: ${via}.` }
    }

    const seconds = Number(arg)
    if (/^\d+$/.test(arg) && seconds <= 86400) {
      await $.store.set('seconds', seconds)
      return { text: `OK: you will be notified for turns longer than ${seconds}s.` }
    }

    return { text: USAGE }
  })
}
