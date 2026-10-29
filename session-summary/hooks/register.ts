import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FileTouch, Todo } from '../types'

const todoList = atom({ plugin: 'session-summary', key: 'todoList' } as const, [])
const tasks = atom({ plugin: 'session-summary', key: 'tasks' } as const, [])
const files = atom({ plugin: 'session-summary', key: 'files' } as const, [])

const MARK = { completed: '✅', in_progress: '🔄', pending: '⬜' } as const

// A call that ran and did not fail: its `result` is the tool's own output.
const isOk = <R extends { deny?: string; isError?: true }>(
  ran: R,
): ran is Exclude<R, { deny: string } | { isError: true }> =>
  ran.deny === undefined && ran.isError !== true

export const todoLines = (todos: readonly Todo[]) =>
  todos.map(todo => `${MARK[todo.status]} ${todo.subject}`)

export const fileLines = (touched: readonly FileTouch[]) =>
  touched.map(file => `- ${file.path} (${file.edits} ${file.edits === 1 ? 'edit' : 'edits'})`)

export const forkPrompt = (
  todos: readonly Todo[],
  touched: readonly FileTouch[],
  focus: string,
) => {
  const parts = [
    'The user ran /summary. Write a short summary of this session for them. Write it in the language the user has been writing in, headings included. Do not call any tools: answer from the conversation alone.',
    [
      'Use these sections, in this order, and leave out any that would be empty:',
      '1. Summary: two to four sentences on the goal and where things stand now.',
      '2. Done: the concrete things that were completed (changes made, files created, commands that mattered, decisions taken), one bullet each, most important first.',
      '3. To-dos: every to-do or plan step of this session with its status, one per line, marked ✅ done, 🔄 in progress or ⬜ not started. Leave this section out when no to-do list or plan was made.',
      '4. Open: what is unfinished, failed, or waiting on the user.',
    ].join('\n'),
    'Be factual: report only what the conversation shows, and say plainly when something failed or was not verified. Keep it under about 250 words.',
  ]

  if (todos.length > 0) {
    parts.push(
      `The session's to-do tools recorded these statuses; treat them as exact:\n${todoLines(todos).join('\n')}`,
    )
  }
  if (touched.length > 0) {
    parts.push(`Files changed in this session (from Edit and Write calls):\n${fileLines(touched).join('\n')}`)
  }
  if (focus !== '') {
    parts.push(`The user asked the summary to focus on: ${focus}`)
  }

  return parts.join('\n\n')
}

// Counts one more edit of `path`; the last 200 files are kept.
const touch = ($: EngineInterface, path: string) =>
  update($, files, list =>
    list.some(file => file.path === path)
      ? list.map(file => (file.path === path ? { ...file, edits: file.edits + 1 } : file))
      : [...list, { path, edits: 1 }].slice(-200),
  )

// What /summary shows when the model could not write one.
const fallback = (todos: readonly Todo[], touched: readonly FileTouch[], why: string) => {
  const parts = [why]
  if (todos.length > 0) parts.push(`To-dos:\n${todoLines(todos).join('\n')}`)
  if (touched.length > 0) parts.push(`Files changed:\n${fileLines(touched).join('\n')}`)

  return parts.join('\n\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'summary',
      description: 'Summarize this session: what was done and which to-dos are finished',
      argumentHint: '[what to focus on]',
    })

    return next(e)
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

  on('command.run', { command: 'summary' }, async ($, e) => {
    const todos = [...(await read($, todoList)), ...(await read($, tasks))]
    const touched = await read($, files)

    $.ui.status('Summarizing the session…')
    try {
      const reply = await $.model.fork({ prompt: forkPrompt(todos, touched, e.args.trim()) })
      if (reply.isAnswered) return { text: reply.text }

      const why =
        reply.reason === 'nothing-to-fork'
          ? 'Nothing to summarize yet: no turn has finished in this session.'
          : `The summary could not be written (${reply.reason}).`
      return { text: fallback(todos, touched, why) }
    } finally {
      $.ui.status(undefined)
    }
  })
}
