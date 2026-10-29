import type { EngineInterface, Register } from 'claude-code'

const SECTION = {
  id: 'turkish-mode:language',
  text: [
    '# Reply language',
    'Always write to the user in Turkish: answers, explanations, questions, plans and summaries, even when the user writes in another language.',
    'Keep code, commands, file paths, error messages and API, library and tool names as they are. Do not force-translate established English terms (commit, branch, deploy, pull request).',
    "In code comments, commit messages and documentation, follow the project's existing language.",
  ].join('\n'),
  scope: 'session',
} as const

// Left unset, the mode is on: the person installed it to get Turkish replies.
const isOn = async ($: EngineInterface) => (await $.store.get('isOn')) !== false

const showStatus = ($: EngineInterface, on: boolean) =>
  $.ui.status(on ? 'Turkish mode' : undefined)

const parseWant = (arg: string, current: boolean) => {
  if (arg === '') return !current
  if (arg === 'on') return true
  if (arg === 'off') return false
  return undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'turkish',
      description: 'Turn Turkish replies on or off',
      argumentHint: '[on|off]',
      immediate: true,
    })
    showStatus($, await isOn($))

    return next(e)
  })

  on('command.run', { command: 'turkish' }, async ($, e) => {
    const want = parseWant(e.args.trim().toLowerCase(), await isOn($))
    if (want === undefined) {
      return { text: 'Usage: /turkish (toggle), /turkish on, /turkish off' }
    }

    await $.store.set('isOn', want)
    showStatus($, want)

    return {
      text: want
        ? 'Turkish mode on: replies will be in Turkish from now on.'
        : 'Turkish mode off.',
    }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await isOn($))) return composed

    return { sections: [...composed.sections, SECTION] }
  })
}
