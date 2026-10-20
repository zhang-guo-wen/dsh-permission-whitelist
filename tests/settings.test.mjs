/**
 * Settings loading: user-level then project-level files, strictest rule first,
 * and a malformed file degrading to "no rules" rather than throwing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSettings } from '../lib/settings.mjs'

/** Create one directory holding a settings file with the given permissions block. */
function makeHome(name, permissions) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pw-'))
  const home = join(root, 'claude')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ permissions }), 'utf8')
  return { root, home, name }
}

test('loads allow/ask/deny, strictest first, and records the source file', () => {
  const { home } = makeHome('user', {
    allow: ['Bash(git status)'],
    ask: ['Bash(npm publish)'],
    deny: ['Bash(rm *)'],
  })
  const loaded = loadSettings(tmpdir(), home)
  assert.deepEqual(loaded.rules.map(rule => rule.kind), ['deny', 'ask', 'allow'])
  assert.equal(loaded.sources.length, 1)
})

test('a project settings file applies to its own workspace only', () => {
  const { home, root } = makeHome('user', { allow: ['Bash(git status)'] })
  const project = join(root, 'project')
  mkdirSync(join(project, '.claude'), { recursive: true })
  writeFileSync(
    join(project, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { deny: ['Bash(curl *)'] } }),
    'utf8',
  )
  const inside = loadSettings(project, home)
  assert.ok(inside.rules.some(rule => rule.kind === 'deny' && rule.specifier === 'curl *'))
  const outside = loadSettings(tmpdir(), home)
  assert.equal(outside.rules.some(rule => rule.kind === 'deny'), false, 'a sibling workspace does not inherit it')
})

test('a malformed or missing settings file contributes no rules instead of throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pw-bad-'))
  assert.deepEqual(loadSettings(root, join(root, 'missing')).rules, [])
  const home = join(root, 'claude')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'settings.json'), '{ not json', 'utf8')
  assert.deepEqual(loadSettings(root, home).rules, [])
})

test('unsupported entries and non-string list members are ignored', () => {
  const { home } = makeHome('user', {
    allow: ['Bash(git status', 42, null, 'Bash(pnpm test *)'],
  })
  const loaded = loadSettings(tmpdir(), home)
  assert.deepEqual(loaded.rules.map(rule => rule.specifier), ['pnpm test *'])
})