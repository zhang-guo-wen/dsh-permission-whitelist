/**
 * Drive the shipped plugin against the settings the isolated instance will read,
 * using the harness's real service contracts where they matter: `loadSettings`
 * reads an actual `.claude/settings.json`, and `apply` runs with a fake host
 * that records the sandbox-mode writes a bypass performs.
 *
 * This is the verification harness for `npm run verify`: it prints one line per
 * case so a human can compare the allowlist's behavior with the intent.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [, , pluginRoot, workspace] = process.argv
const lib = name => pathToFileURL(join(pluginRoot, 'lib', name)).href

const { apply } = await import(lib('index.mjs'))
const { loadSettings } = await import(lib('settings.mjs'))
const { decideCommand, rulesForTool } = await import(lib('rules.mjs'))

const loaded = loadSettings(workspace)
console.log(`settings files: ${loaded.sources.join(', ') || '(none)'}`)
console.log(`rules: ${loaded.rules.map(rule => `${rule.kind} ${rule.tool}(${rule.specifier})`).join(' | ')}`)

const session = {
  header: { cwd: workspace },
  append: (type, data) => { writes.push(`${type}:${data.mode}`) },
}
const writes = []
const listeners = []
const logs = []
const ctx = {
  effect: factory => factory(),
  on: (event, listener) => {
    listeners.push({ event, listener })
    return () => {}
  },
  logger: { info: message => logs.push(message) },
  get: service => (service === 'sandboxPolicy' ? { resolve: () => ({ mode: 'workspace-write' }) } : undefined),
}
apply(ctx, { allowSandboxBypass: true, logDecisions: false })

const cases = [
  ['pnpm test --run', 'allow + bypass'],
  ['git status --short', 'allow + bypass'],
  ['rm -rf build', 'deny'],
  ['git push --force origin main', 'deny'],
  ['npm publish', 'ask (downstream untouched)'],
  ['curl https://example.com', 'no rule'],
  ['git status && rm -rf build', 'deny through the chain'],
  ['node build.mjs', 'allow but never bypass (interpreter)'],
  ['pnpm test > out.txt', 'allow but never bypass (redirection)'],
]

for (const [command, label] of cases) {
  const rules = rulesForTool(loaded.rules, 'bash')
  const decision = decideCommand(rules, command)
  const gate = decision.kind === 'allow' ? 'allow' : decision.kind === 'deny' ? 'deny' : decision.kind ?? 'fall-through'
  const bypass = decision.bypassable ? 'bypass' : 'sandboxed'
  console.log(`${command.padEnd(34)} => ${gate.padEnd(12)} ${decision.kind === 'allow' ? bypass : ''}   [${label}]`)
}

// One end-to-end pass through the real listener: prove the bypass writes and
// restores the session mode around exactly one call.
const gate = listeners.find(item => item.event === 'tools/pre-execute')
const settled = listeners.find(item => item.event === 'tools/result')
const exec = name => ({ name, arguments: { command: 'pnpm test' }, agent: { session }, callId: 'call-verify', signal: AbortSignal.abort() })
const result = await gate.listener(exec('pwsh'), () => Promise.resolve({ kind: 'ask' }))
console.log(`\nlistener pwsh "pnpm test" => ${JSON.stringify(result)}`)
console.log(`mode in force during the call: ${writes.at(-1) ?? '(none)'}`)
settled.listener({ callId: 'call-verify' }, { isError: false, content: [] })
console.log(`sandbox/mode writes: ${writes.join(' -> ') || '(none)'}`)

// `rulesForTool` filters by the exact tool name; the plugin widens `bash` to
// `pwsh` itself, which the listener check above already demonstrates.
const pwshRules = rulesForTool(loaded.rules, 'pwsh')
console.log(`exact-name rules for pwsh: ${pwshRules.length} (bash spelling: ${rulesForTool(loaded.rules, 'bash').length}); the plugin widens Bash(...) to pwsh`)

// Keep the workspace argument honest: a settings file must exist there.
mkdirSync(join(workspace, '.claude'), { recursive: true })
writeFileSync(join(workspace, '.claude', '.verify-ran'), String(loaded.rules.length), 'utf8')