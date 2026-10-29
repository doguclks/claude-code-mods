import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TURN = {
  answer: 'All set. **Tests** pass.',
  durationMs: 45000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const

// What the person's own Enter carries with a typed command.
const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

// Stands for the engine beneath the mod; records every command the mod runs.
const engine = (on: On) => {
  mock.store(on)
  const clock = mock.clock(on)
  const runs: (readonly string[])[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'done-notify' } }))
  on('turn.complete', () => ({ text: '' }))
  on('process.run', (_, e) => {
    runs.push(e.argv)
    return {
      value: {
        exitCode: 0,
        stdout: 'toast\r\nflash\r\nsound\r\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('ui.toast', () => ({ value: undefined }))

  return { clock, runs }
}

const decode = (argv: readonly string[]) => {
  const binary = atob(argv[argv.length - 1] ?? '')
  let text = ''
  for (let i = 0; i < binary.length; i += 2) {
    text += String.fromCharCode(binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8))
  }
  return text
}

const start = { cwd: 'C:\\Projects', surface: 'terminal', isInteractive: true } as const

test('a long turn on Windows raises the signals with the answer', async ($, on) => {
  const { clock, runs } = engine(on)
  await $.session.start(start)

  await $.turn.complete(TURN)
  await clock.settle()

  expect(runs.length).toBe(1)
  expect(runs[0]?.[0]).toBe('powershell.exe')
  expect(decode(runs[0] ?? [])).toContain('Done (45s): All set. Tests pass.')
})

test('short, interrupted and subagent turns stay quiet', async ($, on) => {
  const { clock, runs } = engine(on)
  await $.session.start(start)

  await $.turn.complete({ ...TURN, durationMs: 5000 })
  await $.turn.complete({ ...TURN, isAborted: true, reason: 'aborted' })
  await $.turn.complete({ ...TURN, agentId: 'a1' })
  await clock.settle()

  expect(runs.length).toBe(0)
})

test('/done-notify sets the threshold, turns it off, and tests it', async ($, on) => {
  const { clock, runs } = engine(on)
  await $.session.start(start)

  const set = await $.command.run({ ...TYPED, command: 'done-notify', args: '60' })
  expect(set.text).toContain('60s')
  await $.turn.complete(TURN)
  await clock.settle()
  expect(runs.length).toBe(0)

  await $.command.run({ ...TYPED, command: 'done-notify', args: '10' })
  await $.command.run({ ...TYPED, command: 'done-notify', args: 'off' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(runs.length).toBe(0)

  await $.command.run({ ...TYPED, command: 'done-notify', args: 'on' })
  await $.turn.complete(TURN)
  await clock.settle()
  expect(runs.length).toBe(1)

  const tested = await $.command.run({ ...TYPED, command: 'done-notify', args: 'test' })
  expect(tested.text).toBe('Test notification sent: notification center, taskbar, sound.')
})
