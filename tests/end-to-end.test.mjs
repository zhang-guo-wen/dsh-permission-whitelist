/**
 * End-to-end host verification on a real Cordis context.
 *
 * A sandboxed session cannot bind a web server, so the browser is replaced by
 * this harness: it mounts the plugin the way the Loader does, dispatches a
 * `tools/pre-execute` waterfall for a shell command, and then drives the same
 * "always allow" write the floating action would perform. It proves the pieces
 * the UI depends on actually work together.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../lib/index.mjs'
import { appendAllowRule, ruleForCommand } from '../lib/writer.mjs'

/** Mount the plugin on a real context over one temp workspace. */
function mount(permissions) {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-pw-e2e-'))
  mkdirSync(join(workspace, '.claude'), { recursive: true })
  const settingsPath = join(workspace, '.claude', 'settings.json')
  writeFileSync(settingsPath, JSON.stringify({ permissions }, null, 2) + '\n', 'utf8')

  const appended = []
  const session = {
    header: { cwd: workspace },
    append: (type, data) => appended.push({ type, data }),
  }
  const ctx = new Context()
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) })
  ctx.provide('logger', { info: () => {}, warn: () => {}, error: () => {} })
  apply(ctx, {
    enabled: { get: () => true },
    logDecisions: { get: () => false },
    claudeHome: join(workspace, 'claude-home'),
  })
  const exec = (command) => ({
    name: 'pwsh',
    arguments: { command },
    agent: { session },
    callId: 'call-e2e',
    signal: AbortSignal.abort(),
  })
  return { ctx, workspace, settingsPath, appended, exec, session }
}

test('a command with no rule falls through to the harness default', async () => {
  const built = mount({})
  const decision = await built.ctx.waterfall('tools/pre-execute', built.exec('pnpm test'), () => Promise.resolve({ kind: 'ask' }))
  assert.equal(decision.kind, 'ask')
})

test('an allow rule answers before execution and widens the sandbox for that call', async () => {
  const built = mount({ allow: ['Bash(pnpm test *)'] })
  const decision = await built.ctx.waterfall('tools/pre-execute', built.exec('pnpm test --run'), () => Promise.resolve({ kind: 'ask' }))
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access'])
  built.ctx.emit('tools/result', { callId: 'call-e2e' }, { isError: false, content: [] })
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access', 'workspace-write'])
})

test('the "always allow" write makes the next identical call pass without a rule', async () => {
  const built = mount({})
  const first = await built.ctx.waterfall('tools/pre-execute', built.exec('pnpm test'), () => Promise.resolve({ kind: 'ask' }))
  assert.equal(first.kind, 'ask', 'the first call asks')

  const derived = ruleForCommand('pnpm test --run')
  assert.ok(derived !== undefined)
  assert.equal(appendAllowRule(built.settingsPath, derived.entry), true)

  const second = await built.ctx.waterfall('tools/pre-execute', built.exec('pnpm test'), () => Promise.resolve({ kind: 'ask' }))
  assert.deepEqual(second, { kind: 'allow' }, 'the next call is allowed without asking')
})

test('a deny rule still wins after another command was allowed', async () => {
  const built = mount({ deny: ['Bash(rm *)'] })
  appendAllowRule(built.settingsPath, 'Bash(pnpm test *)')
  const denied = await built.ctx.waterfall('tools/pre-execute', built.exec('rm -rf build'), () => Promise.resolve({ kind: 'allow' }))
  assert.equal(denied.kind, 'deny')
})

test('the settings file keeps its other keys after a write', () => {
  const built = mount({ deny: ['Bash(rm *)'] })
  appendAllowRule(built.settingsPath, 'Bash(git status *)')
  const written = JSON.parse(readFileSync(built.settingsPath, 'utf8'))
  assert.deepEqual(written.permissions.deny, ['Bash(rm *)'])
  assert.deepEqual(written.permissions.allow, ['Bash(git status *)'])
})

test('an allowed file path also runs outside the sandbox', async () => {
  const built = mount({ allow: ['Write(C:/outside/**)'] })
  const call = {
    name: 'write',
    arguments: { file_path: 'C:/outside/report.txt', content: 'x' },
    agent: { session: built.session },
    callId: 'call-file',
    signal: AbortSignal.abort(),
  }
  const decision = await built.ctx.waterfall('tools/pre-execute', call, () => Promise.resolve({ kind: 'ask' }))
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access'], 'the write is unconfined')
})

test('a file path outside every rule still asks', async () => {
  const built = mount({ allow: ['Write(C:/outside/**)'] })
  const call = {
    name: 'write',
    arguments: { file_path: 'C:/elsewhere/report.txt', content: 'x' },
    agent: { session: built.session },
    callId: 'call-file-2',
    signal: AbortSignal.abort(),
  }
  const decision = await built.ctx.waterfall('tools/pre-execute', call, () => Promise.resolve({ kind: 'ask' }))
  assert.equal(decision.kind, 'ask')
  assert.deepEqual(built.appended, [])
})