# claude-code-mods

Five small mods for [Claude Code](https://claude.com/claude-code): reply in Turkish, get told when a long task is done, get asked before a dangerous command runs, sum up a session with its to-dos, and keep a live panel of the session beside the chat.

| Mod | What it does | Command |
| --- | --- | --- |
| `turkish-mode` | Claude writes to you in Turkish; code, commands and established English terms stay as they are. On by default; the status line shows **Turkish mode** while it is on. | `/turkish [on\|off]` |
| `done-notify` | When a turn takes longer than 30 seconds, plays a sound, flashes the terminal's taskbar button and leaves a notification with the start of Claude's answer. Interrupted turns and subagents stay quiet. | `/done-notify [on\|off\|test\|<seconds>]` |
| `command-shield` | Before Claude runs a dangerous Bash or PowerShell command, it asks you: **No, block it**, **Yes, run once** or **Yes, don't ask again** (for the rest of the session). | `/shield [on\|off\|reset]` |
| `session-summary` | Sums up the session: the goal and where it stands, what was done, every to-do marked ✅ done, 🔄 in progress or ⬜ not started, and what is still open. | `/summary [what to focus on]` |
| `session-panel` | A live panel beside the chat: time, turns and cost, a context bar, a to-do progress bar with each item, and the files Claude changed most. | `/panel` |

## Install

At the prompt of a Claude Code terminal session, install the ones you want:

```
/plugin install turkish-mode --marketplace doguclks/claude-code-mods
/plugin install done-notify --marketplace doguclks/claude-code-mods
/plugin install command-shield --marketplace doguclks/claude-code-mods
/plugin install session-summary --marketplace doguclks/claude-code-mods
/plugin install session-panel --marketplace doguclks/claude-code-mods
```

Answer `y` to add the marketplace the first time, then pick a scope (the user scope is first; press Enter). The mod is active right away.

From a shell:

```
claude plugin install turkish-mode --marketplace doguclks/claude-code-mods
claude plugin install done-notify --marketplace doguclks/claude-code-mods
claude plugin install command-shield --marketplace doguclks/claude-code-mods
claude plugin install session-summary --marketplace doguclks/claude-code-mods
claude plugin install session-panel --marketplace doguclks/claude-code-mods
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `doguclks/claude-code-mods`, then **Add plugin**.

## The mods

### turkish-mode

Adds a short section to Claude's system prompt asking for Turkish replies. Code comments, commit messages and docs follow the project's own language. `/turkish` toggles it; the choice is remembered across sessions.

### done-notify

- `/done-notify` shows whether it is on and its threshold.
- `/done-notify test` sends a test right away and says which signals went out.
- `/done-notify 60` notifies only for turns longer than 60 seconds.
- `/done-notify off` / `/done-notify on`.

On Windows it uses three signals, each on its own, through Windows PowerShell: the system notification sound, a flash of the terminal window on the taskbar (until you switch back to it), and a toast in the notification center. Some machines file toasts in the notification center without showing a banner; the sound and the flash still reach you there. On other systems it uses Claude Code's own notification channel (`preferredNotifChannel`), or an in-app toast.

### command-shield

Asks before:

- recursive deletes (`rm -rf`, `Remove-Item -Recurse`, `rd /s`)
- `git push --force`, `git reset --hard`, `git clean -f`, `git checkout -- .` / `git restore .`, `git branch -D`, `git stash clear`
- formatting or partitioning a disk
- shutting down or restarting the computer
- deleting from the registry

`/shield` lists the rules, `/shield off` turns it off (the status line then shows **⚠ Shield off**), `/shield reset` forgets this session's "don't ask again" choices.

It reads the text of Bash and PowerShell commands only: a delete done from inside a script (Python, Node...) is not caught. Treat it as a safety net, not a sandbox.

### session-summary

`/summary` asks the session's own model one side question over the conversation (a fork: nothing is added to the chat, and the cached conversation is reused) and prints the answer, in the language you have been writing in:

- **Summary**: the goal and where things stand.
- **Done**: the concrete things that were completed.
- **To-dos**: each to-do or plan step, marked ✅ done, 🔄 in progress or ⬜ not started.
- **Open**: what is unfinished, failed or waiting on you.

While installed, the mod records Claude's to-do tools (TodoWrite, TaskCreate, TaskUpdate) and the files it edits, and hands them to the summary as exact facts, so to-do statuses are never guessed. `/summary <topic>` focuses the summary, e.g. `/summary only the GitHub part`. A long session takes a few seconds; the status line shows **Summarizing the session…** meanwhile.

### session-panel

```
┌─ Session ─────────────────────┐
│ 1h 12m · 18 turns · $4.12     │
│ Context ███░░░░░░░ 34%        │
│                               │
│ To-dos ███░░░░░░░ 1/3         │
│ ✓ Write the mod               │
│ ▸ Update the README           │
│ · Push                        │
│                               │
│ Files changed (2)             │
│ hooks/register.ts        ×2   │
│ D:/notes.md              ×1   │
└───────────────────────────────┘
```

- Time, turns, cost and context refresh after every turn and every 30 seconds; the context bar turns yellow past 80%.
- To-dos come from Claude's to-do tools (TodoWrite, TaskCreate, TaskUpdate): ✓ done, ▸ in progress, · not started.
- Changed files come from Edit and Write calls, shown relative to the project folder, the most edited first.
- `/panel` opens or closes it, and the choice is remembered. At session start it opens by itself where the terminal is at least 144 columns wide; in a narrower one, `/panel` opens it at any width.

Tracking starts once the mod is installed, so to-dos and edits from before that are not shown.

## Development

Each mod is a hooks module in `<mod>/hooks/register.ts` with tests in `<mod>/tests/`. Once Claude Code has loaded a mod from its folder, `tsc -p <mod>` type-checks it against the types the engine writes to `<mod>/.claude-plugin/types/`.

```
claude plugin validate turkish-mode
claude plugin test turkish-mode
claude --plugin-dir ./turkish-mode
```

## License

[MIT](LICENSE)
