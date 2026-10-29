import type { EngineInterface, Register } from 'claude-code'

type Rule = { id: string; label: string; pattern: RegExp }

// `[^|;&\n]*` keeps a match inside one command of a pipeline or a chain.
export const RULES: readonly Rule[] = [
  {
    id: 'rm-recursive',
    label: 'recursive delete',
    pattern: /\brm\s+(?:[^|;&\n]*\s)?(?:-[fiIvd]*[rR][fiIvdrR]*|--recursive)(?=\s|$)/,
  },
  {
    id: 'ps-recursive',
    label: 'recursive delete',
    pattern: /\b(?:Remove-Item|ri|rm|rmdir|rd|del|erase)\b[^|;&\n]*\s-r[a-z]*\b/i,
  },
  {
    id: 'cmd-recursive',
    label: 'recursive delete',
    pattern: /\b(?:rd|rmdir|del|erase)\b[^|;&\n]*\s\/s\b/i,
  },
  {
    id: 'git-force-push',
    label: 'force push (overwrites remote history)',
    pattern:
      /\bgit\b[^|;&\n]*\spush\b[^|;&\n]*\s(?:--force(?:-with-lease)?|-[a-zA-Z]*f[a-zA-Z]*|\+\S+)(?=\s|$)/,
  },
  {
    id: 'git-reset-hard',
    label: 'git reset --hard (uncommitted changes are lost)',
    pattern: /\bgit\b[^|;&\n]*\sreset\b[^|;&\n]*\s--hard\b/,
  },
  {
    id: 'git-clean',
    label: 'git clean (deletes untracked files)',
    pattern: /\bgit\b[^|;&\n]*\sclean\b[^|;&\n]*\s-[a-zA-Z]*f/,
  },
  {
    id: 'git-discard',
    label: 'discarding all changes',
    pattern: /\bgit\b[^|;&\n]*\s(?:checkout|restore)\b[^|;&\n]*\s\.(?=\s|$)/,
  },
  {
    id: 'git-branch-delete',
    label: 'force-deleting a branch (git branch -D)',
    pattern:
      /\bgit\b[^|;&\n]*\sbranch\b[^|;&\n]*\s(?:-[a-zA-Z]*D[a-zA-Z]*|--delete\s+--force|--force\s+--delete)(?=\s|$)/,
  },
  {
    id: 'git-stash-clear',
    label: 'deleting all stashes',
    pattern: /\bgit\b[^|;&\n]*\sstash\s+clear\b/,
  },
  {
    id: 'disk',
    label: 'formatting or partitioning a disk',
    pattern:
      /\b(?:diskpart|Format-Volume|Clear-Disk|Initialize-Disk|Remove-Partition|mkfs)\b|\bformat\s+[a-z]:|\bdd\b[^|;&\n]*\bof=\/dev\//i,
  },
  {
    id: 'power',
    label: 'shutting down or restarting the computer',
    pattern: /\b(?:Stop-Computer|Restart-Computer)\b|\bshutdown(?:\.exe)?\s+[/-][srp]\b/i,
  },
  {
    id: 'registry',
    label: 'deleting from the registry',
    pattern:
      /\breg(?:\.exe)?\s+delete\b|\b(?:Remove-Item|Remove-ItemProperty|ri|rp)\b[^|;&\n]*\b(?:HKLM|HKCU|HKCR|HKU|HKEY_)/i,
  },
]

export const matchRules = (command: string) =>
  RULES.filter(rule => rule.pattern.test(command))

const DENY = 'No, block it'
const ONCE = 'Yes, run once'
const SESSION = "Yes, don't ask again"

const isOn = async ($: EngineInterface) => (await $.store.get('isOn')) !== false

const showStatus = ($: EngineInterface, on: boolean) =>
  $.ui.status(on ? undefined : '⚠ Shield off')

const unique = (labels: readonly string[]) => [...new Set(labels)]

export const register: Register = on => {
  // Rules the person waved through for this session; a reload asks again.
  const allowed = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'shield',
      description: 'Show the command shield, or turn it on or off',
      argumentHint: '[on|off|reset]',
      immediate: true,
    })
    showStatus($, await isOn($))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Bash' && e.tool !== 'PowerShell') return next(e)
    if (!(await isOn($))) return next(e)

    const hits = matchRules(e.command).filter(rule => !allowed.has(rule.id))
    if (hits.length === 0) return next(e)

    const labels = unique(hits.map(rule => rule.label)).join(', ')
    const shown = e.command.length > 300 ? `${e.command.slice(0, 299)}…` : e.command

    let answer: string
    try {
      answer = await $.ui.ask(
        `Claude wants to run this command (${labels}):\n\n${shown}\n\nRun it?`,
        { header: 'Shield', options: [DENY, ONCE, SESSION] },
      )
    } catch {
      return { deny: `Command shield blocked this (${labels}): the question was dismissed.` }
    }

    if (answer === ONCE) return next(e)
    if (answer === SESSION) {
      for (const rule of hits) allowed.add(rule.id)
      return next(e)
    }

    const note = answer === DENY ? '' : ` The user's note: ${answer}`
    return {
      deny: `Command shield blocked this (${labels}): the user did not allow it. Suggest a safer way, or ask the user first.${note}`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'Command shield: its check failed, so the command was blocked to be safe.' },
  )

  on('command.run', { command: 'shield' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'on') {
      await $.store.set('isOn', true)
      showStatus($, true)
      return { text: 'Command shield on.' }
    }

    if (arg === 'off') {
      await $.store.set('isOn', false)
      showStatus($, false)
      return { text: 'Command shield off: dangerous commands now run without asking. Turn it back on with /shield on.' }
    }

    if (arg === 'reset') {
      allowed.clear()
      return { text: "This session's \"don't ask again\" choices are cleared; the shield asks every time again." }
    }

    if (arg !== '') return { text: 'Usage: /shield [on|off|reset]' }

    const state = (await isOn($)) ? 'on' : 'off'
    const watched = unique(RULES.map(rule => rule.label)).map(label => `  • ${label}`)
    const skipped =
      allowed.size === 0 ? '' : `\nNot asked again this session: ${[...allowed].join(', ')}`

    return {
      text: `Command shield is ${state}. It asks before:\n${watched.join('\n')}${skipped}`,
    }
  })
}
