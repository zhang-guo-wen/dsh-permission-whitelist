/**
 * Host-contract tests: drive the exported `apply` on a real Cordis `Context`, so
 * the service registration, effect disposal, and listener wiring are the same
 * ones the Loader performs. Only the harness services the gate reads are stubbed.
 *
 * The remote service mounts through `ctx.inject(['typertGateway'])`; without a
 * gateway it stays unmounted, which is exactly what these tests want — they
 * exercise the pre-execute gate and the sandbox restore.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../lib/index.mjs'

/** Build a workspace with one settings file and a real Cordis context around it. */
function harness(permissions, mode = 'workspace-write') {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-pw-apply-'))
  mkdirSync(join(workspace, '.claude'), { recursive: true })
  writeFileSync(join(workspace, '.claude', 'settings.json'), JSON.stringify({ permissions }), 'utf8')

  const appended = []
  const logs = []
  const session = {
    header: { cwd: workspace },
    append: (type, data) => appended.push({ type, data }),
  }
  const agent = { session }
  const ctx = new Context()
  // The two harness services the gate reads: the sandbox policy (for the mode
  // it restores) and the logger.
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode, workspaceRoot: workspace }) })
  ctx.provide('logger', { info: message => logs.push(message) })
  const exec = (name, args) => ({
    name,
    arguments: args,
    agent,
    callId: 'call-1',
    signal: AbortSignal.abort(),
  })
  return { ctx, workspace, session, agent, exec, appended, logs, mode }
}

/** Run the plugin's pre-execute listener for one call. */
async function decide(built, name, args, next = () => Promise.resolve({ kind: 'allow' })) {
  apply(built.ctx, {
    enabled: { get: () => built.disabled !== true },
    logDecisions: { get: () => true },
    claudeHome: undefined,
  })
  const exec = built.exec(name, args)
  // The registry dispatches `tools/pre-execute` as a waterfall; drive it the
  // same way so listener ordering is what the host produces.
  return built.ctx.waterfall('tools/pre-execute', exec, next)
}

/** Fire the settle event the bypass restore listens for. */
async function settle(built, callId = 'call-1') {
  built.ctx.emit('tools/result', { callId }, { isError: false, content: [] })
}

test('an allowed command short-circuits to allow without a prompt', async () => {
  const built = harness({ allow: ['Bash(pnpm test *)'] })
  let prompted = false
  const decision = await decide(built, 'pwsh', { command: 'pnpm test --run' }, () => {
    prompted = true
    return Promise.resolve({ kind: 'ask' })
  })
  assert.deepEqual(decision, { kind: 'allow' })
  assert.equal(prompted, false, 'the downstream ask listener never runs')
})

test('a deny rule refuses the command and names the rule', async () => {
  const built = harness({ deny: ['Bash(rm *)'] })
  const decision = await decide(built, 'pwsh', { command: 'rm -rf build' })
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /rm \*/u)
})

test('an unmatched command keeps the downstream decision', async () => {
  const built = harness({ allow: ['Bash(git status *)'] })
  const decision = await decide(built, 'pwsh', { command: 'curl https://example.com' },
    () => Promise.resolve({ kind: 'ask', reason: 'needs approval' }))
  assert.equal(decision.kind, 'ask')
})

test('an allow entry runs the command outside the sandbox so it can complete', async () => {
  const built = harness({ allow: ['Bash(pnpm install *)'] })
  const decision = await decide(built, 'pwsh', { command: 'pnpm install' })
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access'],
    'the body sees the widened mode')
  await settle(built)
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access', 'workspace-write'],
    'the previous mode is written back once the call settles')
})

test('the master switch off leaves every call to the harness default', async () => {
  const built = harness({ allow: ['Bash(pnpm install *)'], deny: ['Bash(rm *)'] })
  built.disabled = true
  const allowed = await decide(built, 'pwsh', { command: 'pnpm install' },
    () => Promise.resolve({ kind: 'ask' }))
  assert.equal(allowed.kind, 'ask', 'not short-circuited')
  assert.deepEqual(built.appended, [], 'no sandbox write happens')
  const denied = await decide(built, 'pwsh', { command: 'rm -rf build' },
    () => Promise.resolve({ kind: 'ask' }))
  assert.equal(denied.kind, 'ask', 'the deny list is inert too')
})

test('the restore ignores a settle event for an unrelated call', async () => {
  const built = harness({ allow: ['Bash(pnpm install *)'] })
  await decide(built, 'pwsh', { command: 'pnpm install' })
  await settle(built, 'some-other-call')
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access'])
  await settle(built)
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access', 'workspace-write'])
})

test('a command with a nested shell matches but is never bypassed', async () => {
  const built = harness({ allow: ['Bash(pwsh *)'] })
  const decision = await decide(built, 'pwsh', { command: 'pwsh -c "Remove-Item -Recurse x"' })
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(built.appended, [], 'no bypass for a nested interpreter')
})

test('a Bash rule also governs the pwsh tool', async () => {
  const built = harness({ allow: ['Bash(git status *)'] })
  const decision = await decide(built, 'pwsh', { command: 'git status' })
  assert.deepEqual(decision, { kind: 'allow' })
})