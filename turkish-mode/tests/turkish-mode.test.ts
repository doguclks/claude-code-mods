import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const ENGINE_SECTIONS = [
  { id: 'intro', text: 'You are Claude Code.', scope: 'shared' },
] as const

// What the person's own Enter carries with a typed command.
const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

// Stands for the engine beneath the mod; records the status line.
const engine = (on: On) => {
  mock.store(on)
  const statuses: (string | undefined)[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'turkish' } }))
  on('prompt.compose', () => ({ sections: ENGINE_SECTIONS }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })

  return { statuses }
}

const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['terminal'],
  tools: [],
  outputStyle: null,
  traits: [],
} as const

const ids = async ($: Engine) =>
  (await $.prompt.compose(COMPOSE)).sections.map(section => section.id)

test('the Turkish section is added last, on by default', async ($, on) => {
  const { statuses } = engine(on)
  await $.session.start({ cwd: 'C:\\Projects', surface: 'terminal', isInteractive: true })

  expect(await ids($)).toEqual(['intro', 'turkish-mode:language'])
  expect(statuses.at(-1)).toBe('Turkish mode')
})

test('/turkish turns it off and on again', async ($, on) => {
  const { statuses } = engine(on)
  await $.session.start({ cwd: 'C:\\Projects', surface: 'terminal', isInteractive: true })

  const off = await $.command.run({ ...TYPED, command: 'turkish', args: '' })
  expect(off.text).toBe('Turkish mode off.')
  expect(await ids($)).toEqual(['intro'])
  expect(statuses.at(-1)).toBe(undefined)

  await $.command.run({ ...TYPED, command: 'turkish', args: 'ON' })
  expect(await ids($)).toEqual(['intro', 'turkish-mode:language'])
})
