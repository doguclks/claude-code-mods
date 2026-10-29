import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FileTouch, Stats, Todo } from '../types'

const PANE = 'session-panel'
const TITLE = 'Session'
const MAX_TODOS = 12
const MAX_FILES = 6

const todoList = atom({ plugin: 'session-panel', key: 'todoList' } as const, [])
const tasks = atom({ plugin: 'session-panel', key: 'tasks' } as const, [])
const files = atom({ plugin: 'session-panel', key: 'files' } as const, [])
const stats = atom({ plugin: 'session-panel', key: 'stats' } as const, null)
const cwd = atom({ plugin: 'session-panel', key: 'cwd' } as const, '')

// A call that ran and did not fail: its `result` is the tool's own output.
const isOk = <R extends { deny?: string; isError?: true }>(
  ran: R,
): ran is Exclude<R, { deny: string } | { isError: true }> =>
  ran.deny === undefined && ran.isError !== true

export const formatElapsed = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '<1m'
  const hours = Math.floor(minutes / 60)

  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes % 60}m`
}

export const bar = (ratio: number, width: number) => {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// The path as the panel shows it: relative to the session's folder when inside it.
export const shortPath = (path: string, root: string) => {
  const file = path.replace(/\\/g, '/')
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  const isInside = base !== '' && file.toLowerCase().startsWith(`${base.toLowerCase()}/`)

  return isInside ? file.slice(base.length + 1) : file
}

const refreshStats = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  const fresh: Stats = {
    startedAt: usage.startedAt,
    now: await $.clock.now(),
    turns: await $.session.turns(),
    contextPercent: usage.context.percent ?? null,
    usd: usage.cost?.usd ?? null,
  }
  await update($, stats, () => fresh)
}

// Counts one more edit of `path`; the last 200 files are kept.
const touch = ($: EngineInterface, path: string) =>
  update($, files, list =>
    list.some(file => file.path === path)
      ? list.map(file => (file.path === path ? { ...file, edits: file.edits + 1 } : file))
      : [...list, { path, edits: 1 }].slice(-200),
  )

const MARK = {
  completed: { glyph: '✓', color: 'success' },
  in_progress: { glyph: '▸', color: 'warning' },
  pending: { glyph: '·', color: 'inactive' },
} as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await update($, cwd, () => e.cwd)
    await $.command.register({
      name: 'panel',
      description: 'Open or close the session panel',
    })
    await refreshStats($)
    $.clock.every(30_000, () => void refreshStats($))
    if ((await $.store.get('autoOpen')) !== false) {
      void $.ui.open({ id: PANE, title: TITLE })
    }

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await refreshStats($)
    return done
  })

  on('command.run', { command: 'panel' }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      await $.store.set('autoOpen', false)
      return { text: 'Session panel closed; /panel opens it again.' }
    }

    await $.store.set('autoOpen', true)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return {
      text: opened.isPlaced
        ? 'Session panel open.'
        : `Session panel is waiting for room (${opened.reason}).`,
    }
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (isOk(ran)) {
      const list: Todo[] = e.todos.map((todo, i) => ({
        id: String(i + 1),
        subject: todo.content,
        status: todo.status,
      }))
      await update($, todoList, () => list)
    }
    return ran
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const task = isOk(ran) ? ran.result.task : undefined
    if (task !== undefined) {
      const created: Todo = { id: task.id, subject: task.subject || e.subject, status: 'pending' }
      await update($, tasks, list => [...list.filter(one => one.id !== task.id), created])
    }
    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (!isOk(ran)) return ran

    const status = e.status
    if (status === 'deleted') {
      await update($, tasks, list => list.filter(one => one.id !== e.taskId))
    } else {
      await update($, tasks, list =>
        list.map(one =>
          one.id === e.taskId
            ? { ...one, subject: e.subject ?? one.subject, status: status ?? one.status }
            : one,
        ),
      )
    }
    return ran
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (isOk(ran)) await touch($, e.file_path)
    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (isOk(ran)) await touch($, e.file_path)
    return ran
  })

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const ran = await next(e)
    if (isOk(ran)) await touch($, e.notebook_path)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, stats)
    const todos = [...(await read($, todoList)), ...(await read($, tasks))]
    const touched = [...(await read($, files))].sort((a, b) => b.edits - a.edits)
    const root = await read($, cwd)

    const barWidth = Math.max(4, Math.min(16, e.props.bodyColumns - 14))
    const done = todos.filter(todo => todo.status === 'completed').length
    const shownTodos = todos.slice(0, MAX_TODOS)
    const shownFiles = touched.slice(0, MAX_FILES)
    const percent = s?.contextPercent ?? null

    return (
      <Box flexDirection="column">
        {s === null ? (
          <Text dimColor>Collecting…</Text>
        ) : (
          <Text>
            {formatElapsed(s.now - s.startedAt)} · {s.turns} {s.turns === 1 ? 'turn' : 'turns'}
            {s.usd === null ? '' : ` · $${s.usd.toFixed(2)}`}
          </Text>
        )}
        {percent !== null && (
          <Text>
            <Text dimColor>Context </Text>
            <Text color={percent >= 80 ? 'warning' : 'claude'}>{bar(percent / 100, barWidth)}</Text>
            {` ${Math.round(percent)}%`}
          </Text>
        )}

        <Box marginTop={1}>
          <Text bold>To-dos </Text>
          {todos.length > 0 && (
            <Text>
              <Text color="success">{bar(done / todos.length, barWidth)}</Text>
              {` ${done}/${todos.length}`}
            </Text>
          )}
        </Box>
        {todos.length === 0 && <Text dimColor>No to-dos yet.</Text>}
        {shownTodos.map(todo => (
          <Text
            key={todo.id}
            color={MARK[todo.status].color}
            bold={todo.status === 'in_progress'}
            wrap="truncate-end"
          >
            {`${MARK[todo.status].glyph} ${todo.subject}`}
          </Text>
        ))}
        {todos.length > MAX_TODOS && <Text dimColor>{`+${todos.length - MAX_TODOS} more`}</Text>}

        <Box marginTop={1}>
          <Text bold>{`Files changed (${touched.length})`}</Text>
        </Box>
        {touched.length === 0 && <Text dimColor>No files changed yet.</Text>}
        {shownFiles.map(file => (
          <Box key={file.path} flexDirection="row" justifyContent="space-between">
            <Box flexShrink={1}>
              <Text wrap="truncate-middle">{shortPath(file.path, root)}</Text>
            </Box>
            <Text dimColor>{` ×${file.edits}`}</Text>
          </Box>
        ))}
        {touched.length > MAX_FILES && <Text dimColor>{`+${touched.length - MAX_FILES} more`}</Text>}
      </Box>
    )
  })
}
