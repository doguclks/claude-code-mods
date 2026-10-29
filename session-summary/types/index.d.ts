export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type Todo = { id: string; subject: string; status: TodoStatus }
export type FileTouch = { path: string; edits: number }

declare module 'claude-code' {
  interface PluginState {
    'session-summary': {
      // The latest TodoWrite list, replaced whole on every call.
      todoList: Todo[]
      // Tasks from TaskCreate and TaskUpdate, kept by id.
      tasks: Todo[]
      files: FileTouch[]
    }
  }
}
