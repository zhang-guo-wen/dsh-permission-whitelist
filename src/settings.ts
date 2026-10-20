/**
 * Load Claude Code permission settings: the user-level `~/.claude/settings.json`
 * and, beneath it, any project-level `.claude/settings.local.json` and
 * `.claude/settings.json`. A missing or malformed file contributes no rules and
 * never aborts loading, so a broken settings file degrades to "no allowlist"
 * rather than to an unguarded or a blocked session.
 *
 * @module @guowenzhang/dsh-permission-whitelist/settings
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseRule, type PermissionRule, type RuleKind } from './rules.ts'

/** Project-relative settings files, lowest precedence first. */
const PROJECT_SETTINGS_FILES: readonly string[] = [
  join('.claude', 'settings.json'),
  join('.claude', 'settings.local.json'),
]

/** Lists a settings object may carry, in the order they are read. */
const RULE_LISTS: readonly RuleKind[] = ['allow', 'ask', 'deny']

/** Every rule in force for one session workspace. */
export interface LoadedSettings {
  /** Parsed rules in precedence order (`deny`, `ask`, `allow`), later files last. */
  readonly rules: readonly PermissionRule[]
  /** Files that contributed at least one rule, for logging and diagnostics. */
  readonly sources: readonly string[]
}

/**
 * Resolve the Claude Code home directory, honoring the same variables Claude
 * Code itself reads.
 * @returns the absolute config directory.
 */
export function claudeHome(): string {
  return resolve(process.env['CLAUDE_CONFIG_DIR'] ?? process.env['CLAUDE_HOME'] ?? join(homedir(), '.claude'))
}

/**
 * Read one settings file's `permissions` lists.
 * @param path - absolute settings path.
 * @returns the parsed rules (possibly empty).
 */
function readRuleFile(path: string): PermissionRule[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // Absent or malformed: no rules from this file. The allowlist can only
    // widen what already runs, so a silent miss is safe here.
    return []
  }
  const permissions = (parsed as { permissions?: unknown } | null)?.permissions
  if (typeof permissions !== 'object' || permissions === null) return []
  const collected: PermissionRule[] = []
  for (const kind of RULE_LISTS) {
    const list = (permissions as Record<string, unknown>)[kind]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (typeof entry !== 'string') continue
      const rule = parseRule(kind, entry)
      if (rule !== undefined) collected.push(rule)
    }
  }
  return collected
}

/**
 * Load every settings file that applies to one workspace. The workspace root is
 * the session's own directory, so a nested repository does not inherit its
 * parent's allowlist.
 * @param workspaceRoot - absolute session workspace directory.
 * @param home - the Claude Code config directory.
 * @returns the rules in force plus the files that supplied them.
 */
export function loadSettings(workspaceRoot: string, home: string = claudeHome()): LoadedSettings {
  const rules: PermissionRule[] = []
  const sources: string[] = []
  const files = [join(home, 'settings.json'), ...PROJECT_SETTINGS_FILES.map(file => join(workspaceRoot, file))]
  for (const file of files) {
    const fromFile = readRuleFile(file)
    if (fromFile.length === 0) continue
    rules.push(...fromFile)
    sources.push(file)
  }
  // Order strictest first so the gate can stop at the first kind that matches;
  // the sort is stable, so files keep their own order within one kind.
  const rank = (kind: RuleKind): number => (kind === 'deny' ? 0 : kind === 'ask' ? 1 : 2)
  const ordered = [...rules].sort((left, right) => rank(left.kind) - rank(right.kind))
  return { rules: ordered, sources }
}