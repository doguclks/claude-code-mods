import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const STARTED = 1_000_000
const ROOT = 'C:\\Projects\\app'

const PANE = {
  plugin: 'session-panel',
  component: 'Pane',
  requestId: 'session-panel',
  props: {
    title: 'Session',
    isFocused: false,
    bodyColumns: 34,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// Stands for the engine beneath the mod: a session 72 minutes and 18 turns
// in, a third of its context used, every tool call succeeding.
const engine = (on: On) => {
  mock.store(on)
  mock.clock(on, { now: STARTED + 72 * 60_000 })
  const opened: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.usage', () => ({
    value: {
      startedAt: STARTED,
      context: { tokens: 340_000, window: 1_000_000, percent: 34 },
      rateLimits: [],
      cost: { usd: 4.123 },
    },
  }))
  on('session.turns', () => ({ value: 18 }))
  on('tool.call', () => ({ result: {} }))

  return { opened }
}

const start = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const

test('the panel opens at start and shows time, turns, cost and context', async ($, on) => {
  const { opened } = engine(on)
  await $.session.start(start)

  expect(opened).toEqual(['session-panel'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /1h 12m/ }))?.text).toBe('1h 12m · 18 turns · $4.12')
    expect(await ui.find({ type: 'Text', text: /34%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No to-dos yet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('to-dos and changed files show up with their progress', async ($, on) => {
  engine(on)
  await $.session.start(start)

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Write the mod', status: 'completed', activeForm: 'Writing the mod' },
      { content: 'Update the README', status: 'in_progress', activeForm: 'Updating the README' },
      { content: 'Push', status: 'pending', activeForm: 'Pushing' },
    ],
  })
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}\\hooks\\register.ts`, old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}\\hooks\\register.ts`, old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', file_path: 'D:\\notes.md', content: '# notes' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: '✓ Write the mod' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▸ Update the README' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '· Push' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\/3/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Files changed (2)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'hooks/register.ts' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'D:/notes.md' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' ×2' })).toBeDefined()
    await ui.unmount()
  }
})
