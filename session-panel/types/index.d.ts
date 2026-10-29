export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type Todo = { id: string; subject: string; status: TodoStatus }
export type FileTouch = { path: string; edits: number }
export type Stats = {
  startedAt: number
  now: number
  turns: number
  contextPercent: number | null
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'session-panel': {
      // The latest TodoWrite list, replaced whole on every call.
      todoList: Todo[]
      // Tasks from TaskCreate and TaskUpdate, kept by id.
      tasks: Todo[]
      files: FileTouch[]
      // Refreshed at session start, after each turn and every 30 seconds.
      stats: Stats | null
      cwd: string
    }
  }
}
