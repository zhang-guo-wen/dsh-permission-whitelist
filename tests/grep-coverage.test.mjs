/**
 * Does the gate cover a non-shell tool such as `grep` (which spawns ripgrep)?
 *
 * A path rule for that tool should both answer the call and widen the sandbox,
 * because the tool's own subprocess is what the sandbox was blocking.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../lib/index.mjs'

function mount(permissions) {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-pw-grep-'))
  mkdirSync(join(workspace, '.claude'), { recursive: true })
  writeFileSync(join(workspace, '.claude', 'settings.json'), JSON.stringify({ permissions }), 'utf8')
  const appended = []
  const session = { header: { cwd: workspace }, append: (type, data) => appended.push({ type, data }) }
  const ctx = new Context()
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) })
  ctx.provide('logger', { info: () => {}, warn: () => {}, error: () => {} })
  apply(ctx, {
    enabled: { get: () => true },
    logDecisions: { get: () => false },
    claudeHome: join(workspace, 'claude-home'),
  })
  return { ctx, workspace, appended, session }
}

test('a grep call inside an allowed path gets the sandbox lifted for that call', async () => {
  const built = mount({ allow: ['Grep(src/**)'] })
  const call = {
    name: 'grep',
    arguments: { pattern: 'TODO', path: 'src/index.ts' },
    agent: { session: built.session },
    callId: 'call-grep',
    signal: AbortSignal.abort(),
  }
  const decision = await built.ctx.waterfall('tools/pre-execute', call, () => Promise.resolve({ kind: 'ask' }))
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(built.appended.map(entry => entry.data.mode), ['danger-full-access'], 'ripgrep can spawn')
})

test('a grep call outside the allowed path still asks', async () => {
  const built = mount({ allow: ['Grep(src/**)'] })
  const call = {
    name: 'grep',
    arguments: { pattern: 'TODO', path: 'docs/readme.md' },
    agent: { session: built.session },
    callId: 'call-grep-2',
    signal: AbortSignal.abort(),
  }
  const decision = await built.ctx.waterfall('tools/pre-execute', call, () => Promise.resolve({ kind: 'ask' }))
  assert.equal(decision.kind, 'ask')
})
