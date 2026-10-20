/**
 * Rule derivation and the settings write: the two behaviors behind the
 * "always allow" button. The writer runs against real files in a temp directory
 * so the merge, the duplicate check, and the backup are exercised as shipped.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendAllowRule, projectRulesPath, ruleForCommand } from '../lib/writer.mjs'

test('derives a program-only rule when the program has no subcommand', () => {
  assert.deepEqual(ruleForCommand('pnpm test --run'), { entry: 'Bash(pnpm test *)', wildcard: true })
  assert.deepEqual(ruleForCommand('tsc --noEmit'), { entry: 'Bash(tsc *)', wildcard: true })
  assert.deepEqual(ruleForCommand('cargo'), { entry: 'Bash(cargo *)', wildcard: true })
})

test('derives a subcommand rule for git-like programs and stops there', () => {
  assert.deepEqual(ruleForCommand('git push --force origin main'), { entry: 'Bash(git push *)', wildcard: true })
  assert.deepEqual(ruleForCommand('docker compose up -d'), { entry: 'Bash(docker compose *)', wildcard: true })
  // A flag in the subcommand position is not a subcommand.
  assert.deepEqual(ruleForCommand('cargo --version'), { entry: 'Bash(cargo *)', wildcard: true })
})

test('never pastes this call\'s arguments or paths into the rule', () => {
  const derived = ruleForCommand('pnpm test --filter @acme/app -- C:/secret/path.spec.ts')
  assert.ok(derived !== undefined)
  assert.equal(derived.entry.includes('secret'), false)
  assert.equal(derived.entry.includes('--filter'), false)
})

test('rejects an empty command instead of writing a wildcard', () => {
  assert.equal(ruleForCommand('   '), undefined)
  assert.equal(ruleForCommand(''), undefined)
})

test('appends to an existing permissions block and preserves other keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pw-writer-'))
  const file = join(dir, '.claude', 'settings.json')
  mkdirSync(join(dir, '.claude'), { recursive: true })
  writeFileSync(file, JSON.stringify({
    permissions: { allow: ['Bash(git status *)'], deny: ['Bash(rm *)'] },
    model: 'x',
  }, null, 2))

  assert.equal(appendAllowRule(file, 'Bash(pnpm test *)'), true)
  const written = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(written.permissions.allow, ['Bash(git status *)', 'Bash(pnpm test *)'])
  assert.deepEqual(written.permissions.deny, ['Bash(rm *)'], 'the deny list is untouched')
  assert.equal(written.model, 'x', 'unrelated settings survive')
})

test('creates the file and the permissions block when absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pw-writer-new-'))
  const file = join(dir, '.claude', 'settings.json')
  assert.equal(appendAllowRule(file, 'Bash(npx tsc *)'), true)
  const written = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(written.permissions.allow, ['Bash(npx tsc *)'])
})

test('a repeated entry is a no-op and leaves no duplicate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pw-writer-dup-'))
  const file = join(dir, '.claude', 'settings.json')
  appendAllowRule(file, 'Bash(pnpm test *)')
  assert.equal(appendAllowRule(file, 'Bash(pnpm test *)'), false)
  const written = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(written.permissions.allow, ['Bash(pnpm test *)'])
})

test('the previous bytes are preserved beside the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pw-writer-bak-'))
  const file = join(dir, '.claude', 'settings.json')
  appendAllowRule(file, 'Bash(pnpm test *)')
  appendAllowRule(file, 'Bash(npx tsc *)')
  const backups = readdirSync(join(dir, '.claude')).filter(name => name.includes('.bak-'))
  assert.equal(backups.length >= 1, true, 'a backup of the replaced file exists')
})

test('a malformed settings file is refused rather than overwritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pw-writer-bad-'))
  const file = join(dir, '.claude', 'settings.json')
  mkdirSync(join(dir, '.claude'), { recursive: true })
  writeFileSync(file, '{ not json')
  assert.throws(() => appendAllowRule(file, 'Bash(pnpm test *)'))
  assert.equal(readFileSync(file, 'utf8'), '{ not json', 'the user\'s file is untouched')
})

test('the project rules path always lands inside the workspace', () => {
  assert.equal(projectRulesPath('C:/repo'), 'C:/repo/.claude/settings.json')
  assert.equal(projectRulesPath('C:\\repo\\'), 'C:\\repo/.claude/settings.json')
})