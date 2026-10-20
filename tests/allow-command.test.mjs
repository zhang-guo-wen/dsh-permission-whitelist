/**
 * The `/allow` command is the path that actually writes rules: the browser
 * action cannot reach the Host without generated Typert contracts, so this
 * command carries the same job on the Host side. These tests pin its
 * registration, its grammar, and that it writes through to the settings file.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../lib/index.mjs'

/** Mount the plugin over one workspace, with a command registry that records. */
async function harness(permissions = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-pw-allow-'))
  mkdirSync(join(workspace, '.claude'), { recursive: true })
  const settingsPath = join(workspace, '.claude', 'settings.json')
  writeFileSync(settingsPath, JSON.stringify({ permissions }), 'utf8')

  const registered = []
  const ctx = new Context()
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) })
  ctx.provide('logger', { info: () => {}, warn: () => {}, error: () => {} })
  ctx.provide('commands', {
    register: (definition) => {
      registered.push(definition)
      return () => {}
    },
  })
  const session = { header: { cwd: workspace }, append: () => {} }
  apply(ctx, {
    enabled: { get: () => true },
    logDecisions: { get: () => false },
    claudeHome: join(workspace, 'claude-home'),
  })
  // `ctx.inject` settles on a later tick, so the registration lands after
  // `apply` returns; waiting here is what the Loader's own startup provides.
  await new Promise(resolve => { setTimeout(resolve, 50) })
  return { ctx, workspace, settingsPath, registered, session }
}

test('the allow command registers with the host registry', async () => {
  const built = await harness()
  const names = built.registered.map(definition => definition.name)
  assert.ok(names.includes('allow'), `registered commands: ${names.join(', ') || '(none)'}`)
})

test('the allow command writes a rule for one command line', async () => {
  const built = await harness()
  const definition = built.registered.find(entry => entry.name === 'allow')
  assert.ok(definition !== undefined)

  const result = await definition.handler({
    agent: { session: built.session },
    rawInput: 'pnpm test --run',
    attachments: [],
    signal: AbortSignal.abort(),
  })

  assert.equal(result.kind, 'success')
  const written = JSON.parse(readFileSync(built.settingsPath, 'utf8'))
  assert.deepEqual(written.permissions.allow, ['Bash(pnpm test *)'])
})

test('the allow command lists rules when given no argument', async () => {
  const built = await harness({ allow: ['Bash(pnpm test *)'] })
  const definition = built.registered.find(entry => entry.name === 'allow')

  const result = await definition.handler({
    agent: { session: built.session },
    rawInput: '',
    attachments: [],
    signal: AbortSignal.abort(),
  })

  assert.equal(result.kind, 'success')
  // The listing lowercases the tool for display; the rule it reports is the one
  // stored, so the comparison is case-insensitive on purpose.
  assert.match(result.text, /bash\(pnpm test \*\)/iu)
})

test('the allow command refuses prose that is not a command', async () => {
  const built = await harness()
  const definition = built.registered.find(entry => entry.name === 'allow')

  const result = await definition.handler({
    agent: { session: built.session },
    rawInput: '允许本次操作使用 danger-full-access 权限',
    attachments: [],
    signal: AbortSignal.abort(),
  })

  assert.equal(result.kind, 'error')
})
