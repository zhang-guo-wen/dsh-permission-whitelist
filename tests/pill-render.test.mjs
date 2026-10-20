/**
 * The floating action's decision logic, tested without a DOM.
 *
 * The component itself only paints; what decides whether the action applies is
 * the derivation the Host performs, so these tests pin that the rule comes from
 * the command text and that a card headline on its own never becomes a rule.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ruleForCommand } from '../lib/writer.mjs'

test('a shell command line yields a family rule', () => {
  assert.equal(ruleForCommand('pnpm test --run')?.entry, 'Bash(pnpm test *)')
  assert.equal(ruleForCommand('git status --short')?.entry, 'Bash(git status *)')
})

test('prose that is not a command yields no rule, so the action stays hidden', () => {
  assert.equal(ruleForCommand('允许本次操作使用 danger-full-access 权限：验证按钮'), undefined)
})

test('an empty card body yields no rule', () => {
  assert.equal(ruleForCommand(''), undefined)
  assert.equal(ruleForCommand('   '), undefined)
})