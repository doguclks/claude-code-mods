import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// What the person's own Enter carries with a typed command.
const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

const USAGE = {
  input_tokens: 10,
  output_tokens: 5,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

// Stands for the engine: tool calls succeed, and the fork answers with
// `reply` (or no fork at all), recording the prompt it was given.
const engine = (on: On, reply: string | null) => {
  const prompts: string[] = []
  let nextTask = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'summary' } }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', (_, e) => {
    if (e.tool === 'TaskCreate') {
      nextTask += 1
      return { result: { task: { id: String(nextTask), subject: e.subject } } }
    }
    return { result: {} }
  })
  on('model.fork', (_, e) => {
    prompts.push(e.prompt)
    return {
      value:
        reply === null
          ? { isAnswered: false, reason: 'nothing-to-fork' }
          : { isAnswered: true, text: reply, usage: USAGE },
    }
  })

  return { prompts }
}

const start = { cwd: 'C:\\Projects', surface: 'terminal', isInteractive: true } as const

test('/summary hands the tracked to-dos and files to the fork', async ($, on) => {
  const { prompts } = engine(on, '## Özet\nHer şey tamam.')
  await $.session.start(start)

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Write the mod', status: 'completed', activeForm: 'Writing the mod' },
      { content: 'Test it', status: 'in_progress', activeForm: 'Testing it' },
      { content: 'Share it', status: 'pending', activeForm: 'Sharing it' },
    ],
  })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write the README', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\a.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\a.ts', old_string: 'y', new_string: 'z' })
  await $.tool.call({ tool: 'Write', file_path: 'C:\\b.md', content: '# b' })

  const shown = await $.command.run({ ...TYPED, command: 'summary', args: 'only the mods' })

  expect(shown.text).toBe('## Özet\nHer şey tamam.')
  const prompt = prompts[0] ?? ''
  expect(prompt).toContain('✅ Write the mod')
  expect(prompt).toContain('🔄 Test it')
  expect(prompt).toContain('⬜ Share it')
  expect(prompt).toContain('✅ Write the README')
  expect(prompt).toContain('- C:\\a.ts (2 edits)')
  expect(prompt).toContain('- C:\\b.md (1 edit)')
  expect(prompt).toContain('focus on: only the mods')
})

test('with nothing to fork, /summary still lists what it tracked', async ($, on) => {
  engine(on, null)
  await $.session.start(start)

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Plan it', status: 'pending', activeForm: 'Planning it' }],
  })
  const shown = await $.command.run({ ...TYPED, command: 'summary', args: '' })

  expect(shown.text).toContain('Nothing to summarize yet')
  expect(shown.text).toContain('⬜ Plan it')
})

test('a deleted task leaves the list', async ($, on) => {
  const { prompts } = engine(on, 'ok')
  await $.session.start(start)

  await $.tool.call({ tool: 'TaskCreate', subject: 'Keep me', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Drop me', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'deleted' })
  await $.command.run({ ...TYPED, command: 'summary', args: '' })

  expect(prompts[0]).toContain('⬜ Keep me')
  expect(prompts[0]).not.toContain('Drop me')
})
