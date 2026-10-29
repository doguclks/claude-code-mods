# claude-code-mods

Three small mods for [Claude Code](https://claude.com/claude-code): reply in Turkish, get told when a long task is done, and get asked before a dangerous command runs.

| Mod | What it does | Command |
| --- | --- | --- |
| `turkish-mode` | Claude writes to you in Turkish; code, commands and established English terms stay as they are. On by default; the status line shows **Turkish mode** while it is on. | `/turkish [on\|off]` |
| `done-notify` | When a turn takes longer than 30 seconds, plays a sound, flashes the terminal's taskbar button and leaves a notification with the start of Claude's answer. Interrupted turns and subagents stay quiet. | `/done-notify [on\|off\|test\|<seconds>]` |
| `command-shield` | Before Claude runs a dangerous Bash or PowerShell command, it asks you: **No, block it**, **Yes, run once** or **Yes, don't ask again** (for the rest of the session). | `/shield [on\|off\|reset]` |

## Install

At the prompt of a Claude Code terminal session, install the ones you want:

```
/plugin install turkish-mode --marketplace doguclks/claude-code-mods
/plugin install done-notify --marketplace doguclks/claude-code-mods
/plugin install command-shield --marketplace doguclks/claude-code-mods
```

Answer `y` to add the marketplace the first time, then pick a scope (the user scope is first; press Enter). The mod is active right away.

From a shell:

```
claude plugin install turkish-mode --marketplace doguclks/claude-code-mods
claude plugin install done-notify --marketplace doguclks/claude-code-mods
claude plugin install command-shield --marketplace doguclks/claude-code-mods
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

## Development

Each mod is a hooks module in `<mod>/hooks/register.ts` with tests in `<mod>/tests/`:

```
claude plugin validate turkish-mode
claude plugin test turkish-mode
claude --plugin-dir ./turkish-mode
```

## License

[MIT](LICENSE)
