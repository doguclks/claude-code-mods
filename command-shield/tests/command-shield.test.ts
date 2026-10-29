import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { matchRules } from '../hooks/register'

const DANGEROUS: readonly [string, string][] = [
  ['rm -rf node_modules', 'rm-recursive'],
  ['cd app && rm -fr build', 'rm-recursive'],
  ['Remove-Item .\\dist -Recurse -Force', 'ps-recursive'],
  ['rm C:\\tmp\\x -r', 'ps-recursive'],
  ['rd /s /q build', 'cmd-recursive'],
  ['git push --force origin main', 'git-force-push'],
  ['git push -f', 'git-force-push'],
  ['git push origin +main', 'git-force-push'],
  ['git push --force-with-lease', 'git-force-push'],
  ['git reset --hard HEAD~3', 'git-reset-hard'],
  ['git clean -fdx', 'git-clean'],
  ['git checkout -- .', 'git-discard'],
  ['git restore .', 'git-discard'],
  ['git branch -D feature/x', 'git-branch-delete'],
  ['git stash clear', 'git-stash-clear'],
  ['Format-Volume -DriveLetter D', 'disk'],
  ['format d: /q', 'disk'],
  ['Restart-Computer -Force', 'power'],
  ['shutdown /s /t 0', 'power'],
  ['reg delete HKCU\\Software\\Foo /f', 'registry'],
]

const SAFE = [
  'rm file.txt',
  'Remove-Item a.txt -Force',
  'rm -f notes.log',
  'git push -u origin main',
  'git push --follow-tags',
  'git reset HEAD~1',
  'git reset --soft HEAD~1',
  'git checkout main',
  'git checkout -b feature/new',
  'git restore src/app.ts',
  'git branch -d merged-branch',
  'git log --format=%h',
  'git clean -n',
  'npm run format',
  'Get-ChildItem -Recurse',
  'ls -R',
]

test('every dangerous command is caught by its rule', () => {
  for (const [command, id] of DANGEROUS) {
    expect({ command, ids: matchRules(command).map(rule => rule.id) }).toEqual({
      command,
      ids: expect.arrayContaining([id]),
    })
  }
})

test('everyday commands pass untouched', () => {
  for (const command of SAFE) {
    expect({ command, ids: matchRules(command).map(rule => rule.id) }).toEqual({
      command,
      ids: [],
    })
  }
})

// Stands for the engine: the person answers the mod's question with `label`,
// and every command that reaches the engine is recorded.
const engine = (on: On, label: string) => {
  mock.store(on)
  const asked: string[] = []
  const ran: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'shield' } }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', (_, e) => {
    if (e.tool === 'AskUserQuestion') {
      const question = e.questions[0]?.question ?? ''
      asked.push(question)
      return { result: { questions: e.questions, answers: { [question]: label } } }
    }
    if (e.tool === 'Bash' || e.tool === 'PowerShell') ran.push(e.command)
    return { result: {} }
  })

  return { asked, ran }
}

const start = { cwd: 'C:\\Projects', surface: 'terminal', isInteractive: true } as const

test('a refused command never reaches the engine', async ($, on) => {
  const { asked, ran } = engine(on, 'No, block it')
  await $.session.start(start)

  const result = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })

  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('git reset --hard')
  expect(ran).toEqual([])
  expect(JSON.stringify(result)).toContain('Command shield blocked this')
})

test('a safe command is never asked about', async ($, on) => {
  const { asked, ran } = engine(on, 'No, block it')
  await $.session.start(start)

  await $.tool.call({ tool: 'PowerShell', command: 'Get-ChildItem' })

  expect(asked).toEqual([])
  expect(ran).toEqual(['Get-ChildItem'])
})

test(`"don't ask again" stops asking for that rule only`, async ($, on) => {
  const { asked, ran } = engine(on, "Yes, don't ask again")
  await $.session.start(start)

  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' })
  await $.tool.call({ tool: 'Bash', command: 'git push --force' })

  expect(asked.length).toBe(2)
  expect(ran).toEqual(['rm -rf build', 'rm -rf dist', 'git push --force'])
})
