/**
 * Behavior tests for the rule vocabulary: segmentation, matching, precedence,
 * and the bypass escapes an allowlist must not have.
 *
 * The suite imports the built `lib/rules.mjs` so a bundle regression cannot pass
 * unnoticed. Node's default per-file process runner spawns a child with piped
 * stdio, which the DSH Windows sandbox denies; run with
 * `npm test` (which passes `--test-isolation=none`) inside a sandboxed session.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  commandMatcher,
  decideCommand,
  describeSegment,
  parseRule,
  pathMatcher,
  rulesForTool,
  splitCommandSegments,
} from '../lib/rules.mjs'

/** Build a precedence-ordered rule list from one allow/ask/deny table. */
function rulesOf(table) {
  const rules = []
  for (const kind of ['allow', 'ask', 'deny']) {
    for (const entry of table[kind] ?? []) {
      const rule = parseRule(kind, entry)
      assert.ok(rule, `entry should parse: ${entry}`)
      rules.push(rule)
    }
  }
  const rank = kind => (kind === 'deny' ? 0 : kind === 'ask' ? 1 : 2)
  return rules.sort((left, right) => rank(left.kind) - rank(right.kind))
}

test('splits a command line into every segment a shell would run', () => {
  assert.deepEqual(
    splitCommandSegments('pnpm test && git status; echo done | Out-Null'),
    ['pnpm test', 'git status', 'echo done', 'Out-Null'],
  )
  // A quoted separator belongs to its argument, not to the shell.
  assert.deepEqual(splitCommandSegments('node -e "a && b"'), ['node -e "a && b"'])
})

test('matches whole words only, so a longer program name never rides a prefix rule', () => {
  const exact = commandMatcher('git status')
  assert.equal(exact('git status'), true)
  assert.equal(exact('git status --short'), false, 'a rule without a wildcard is exact')
  const prefix = commandMatcher('git status *')
  assert.equal(prefix('git status --short'), true)
  const wholeTool = commandMatcher('git *')
  assert.equal(wholeTool('git push'), true)
  assert.equal(wholeTool('gitx push'), false, 'the program word is compared, not a character prefix')
  assert.equal(wholeTool('sudo git push'), false, 'wrappers are stripped before matching, not inside the matcher')
})

test('a denied command cannot ride an allowed one', () => {
  const rules = rulesOf({
    allow: ['Bash(git status)', 'Bash(rm *)'],
    deny: ['Bash(rm *)'],
  })
  assert.equal(decideCommand(rules, 'git status').kind, 'allow')
  assert.equal(decideCommand(rules, 'git status && rm -rf out').kind, 'deny')
  assert.equal(decideCommand(rules, 'rm -rf out').kind, 'deny')
})

test('an allow requires every segment to be allowed', () => {
  const rules = rulesOf({ allow: ['Bash(git status)'] })
  assert.equal(decideCommand(rules, 'git status').kind, 'allow')
  assert.equal(decideCommand(rules, 'git status; curl https://example.com').kind, undefined)
})

test('a trailing comment cannot widen an allow', () => {
  const rules = rulesOf({ allow: ['Bash(git status *)'] })
  const decision = decideCommand(rules, 'git status --short # then rm -rf /')
  assert.equal(decision.kind, 'allow', 'the word rule still matches')
  assert.equal(decision.bypassable, false, 'but a comment makes the segment ineligible for a sandbox bypass')
})

test('leading variable assignments cannot hide the program word', () => {
  const rules = rulesOf({ allow: ['Bash(git push *)'], deny: ['Bash(git push *)'] })
  assert.equal(decideCommand(rules, 'FOO=1 git push origin main').kind, 'deny')
})

test('wrappers are skipped before comparing the program word', () => {
  const rules = rulesOf({ allow: ['Bash(pnpm test *)'] })
  assert.equal(decideCommand(rules, 'env NODE_ENV=test pnpm test --run').kind, 'allow')
  assert.equal(decideCommand(rules, 'sudo -E pnpm test --run').kind, 'allow')
})

test('nested shells and interpreters are matched but never bypass the sandbox', () => {
  const rules = rulesOf({ allow: ['Bash(pwsh *)', 'Bash(node *)'] })
  // A nested interpreter is only reachable when the allow names it explicitly;
  // what matters is that such a segment can never leave the sandbox.
  assert.equal(decideCommand(rules, 'pwsh -c "git status"').kind, 'allow')
  assert.equal(decideCommand(rules, 'pwsh -c "git status"').bypassable, false)
  assert.equal(decideCommand(rules, 'node build.mjs').bypassable, false)
  assert.equal(describeSegment('node build.mjs').unsafe, true)
})

test('redirection and substitution keep an allow from bypassing the sandbox', () => {
  const rules = rulesOf({ allow: ['Bash(echo *)'] })
  assert.equal(decideCommand(rules, 'echo hi').bypassable, true)
  assert.equal(decideCommand(rules, 'echo hi > C:\\Windows\\x').kind, 'allow')
  assert.equal(decideCommand(rules, 'echo hi > C:\\Windows\\x').bypassable, false)
  assert.equal(decideCommand(rules, 'echo $(whoami)').bypassable, false)
})

test('ask wins over allow and keeps the approval prompt', () => {
  const rules = rulesOf({ allow: ['Bash(npm *)'], ask: ['Bash(npm publish *)'] })
  assert.equal(decideCommand(rules, 'npm publish').kind, 'ask')
  assert.equal(decideCommand(rules, 'npm install').kind, 'allow')
})

test('rules are scoped to their tool name', () => {
  const rules = rulesOf({ allow: ['Bash(git status)'] })
  assert.equal(rulesForTool(rules, 'pwsh').length, 0, 'a bash rule does not authorize pwsh')
  assert.equal(rulesForTool(rules, 'bash').length, 1)
})

test('path rules follow Claude Code: a bare specifier is a relative glob, and a drive path is absolute', () => {
  // pathMatcher receives the specifier already unwrapped by parseRule.
  const relative = pathMatcher('src/**')
  assert.equal(relative('src/a/b.ts', 'C:/repo/src/a/b.ts'), true)
  assert.equal(relative('src', 'C:/repo/src'), true, 'a directory rule also covers the directory itself')
  assert.equal(relative('srcx/a.ts', 'C:/repo/srcx/a.ts'), false)
  const absolute = pathMatcher('C:/repo/README.md')
  assert.equal(absolute('README.md', 'C:/repo/README.md'), true, 'a drive-letter rule compares the absolute path')
  assert.equal(absolute('README.md', 'C:/repo/README.md.bak'), false)
  // parseRule strips the parentheses, so a full entry yields the bare specifier.
  assert.equal(parseRule('allow', 'Edit(src/**)')?.specifier, 'src/**')
})

test('an unparsable entry is ignored instead of widening the allowlist', () => {
  assert.equal(parseRule('allow', 'Bash(git status'), undefined)
  assert.equal(parseRule('allow', 'not a tool!(x)'), undefined)
})

test('an inert pipe target and a bare literal do not need their own rule', () => {
  const rules = rulesOf({ allow: ['Bash(New-Item *)'] })
  const decision = decideCommand(rules, "New-Item -ItemType File -Path 'C:\\x.txt' -Force | Out-Null; 'ok'")
  assert.equal(decision.kind, 'allow')
  assert.equal(decision.bypassable, true, 'nothing in the line has an effect a rule must cover')
})

test('a pipe target that can act still needs its own rule', () => {
  const rules = rulesOf({ allow: ['Bash(New-Item *)'] })
  assert.equal(decideCommand(rules, "New-Item -ItemType File -Path 'C:\\x.txt' | Remove-Item").kind, undefined)
})

test('a chained command still needs its own rule', () => {
  const rules = rulesOf({ allow: ['Bash(New-Item *)'] })
  assert.equal(decideCommand(rules, "New-Item -ItemType File -Path 'C:\\x.txt'; Remove-Item C:\\y.txt").kind, undefined)
})

test('a script-block pipe target never counts as inert', () => {
  const rules = rulesOf({ allow: ['Bash(Get-ChildItem *)'] })
  assert.equal(decideCommand(rules, 'Get-ChildItem | ForEach-Object { Remove-Item $_ }').kind, undefined)
})