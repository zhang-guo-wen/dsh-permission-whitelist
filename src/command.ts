/**
 * `/allow` — add a command to the permission allowlist from the composer.
 *
 * The approval panel has no extension point for a third action (its only child
 * slot is a single cell owned by the host's command display), so the allowlist
 * is authored from a slash command instead: it needs no host change, works in
 * every client, and shows the rule it derived before writing.
 *
 * Grammar:
 * - `/allow` with no argument reports the current rules and where they live.
 * - `/allow <command line>` derives the narrowest rule and appends it to the
 *   project settings file (`<workspace>/.claude/settings.json`).
 * - `/allow --user <command line>` writes to the user settings file instead.
 *
 * @module @guowenzhang/dsh-permission-whitelist/command
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { appendAllowRule, projectRulesPath, ruleForCommand } from './writer.ts'
import { claudeHome, loadSettings } from './settings.ts'

/** Command name without the leading slash. */
export const ALLOW_COMMAND = 'allow'

/** Result of one `/allow` invocation, as the dispatching UI renders it. */
type AllowResult = { readonly kind: 'success'; readonly text?: string } | { readonly kind: 'error'; readonly text: string }

/** The workspace a command invocation came from, or undefined when unknown. */
function workspaceOf(agent: Agent): string | undefined {
  const cwd = agent.session.header.cwd
  return cwd === undefined ? undefined : cwd
}

/**
 * Render the rules currently in force, so a user can inspect the whitelist
 * without opening the settings file by hand.
 * @param workspace - the session workspace.
 * @param home - the Claude Code config directory.
 * @returns a human-readable summary.
 */
function describeRules(workspace: string, home: string): string {
  const loaded = loadSettings(workspace, home)
  if (loaded.rules.length === 0) {
    return 'No permission rules yet. Add one with `/allow <command>`, for example `/allow pnpm test`.'
  }
  const lines = loaded.rules.map(rule => `${rule.kind.padEnd(5)} ${rule.tool}(${rule.specifier})`)
  return `Permission rules in force:\n${lines.join('\n')}\nSources: ${loaded.sources.join(', ')}`
}

/**
 * Register the `/allow` command when the composition mounts a command registry.
 * @param ctx - plugin context.
 * @param claudeHomeOf - resolves the Claude Code config directory for this deployment.
 */
export function registerAllowCommand(ctx: Context, claudeHomeOf: () => string): void {
  ctx.inject(['commands'], (scope) => {
    const commands = (scope as unknown as { commands: { register: (definition: unknown) => () => void } }).commands
    scope.effect(() => commands.register({
      name: ALLOW_COMMAND,
      description: 'Add a command to the permission allowlist, or list the current rules.',
      input: { hint: '[--user] <command line>' },
      recordInput: true,
      handler: (invocation: { agent: Agent; rawInput: string }): AllowResult => {
        const workspace = workspaceOf(invocation.agent)
        if (workspace === undefined) {
          return { kind: 'error', text: 'This session has no workspace directory to store a rule in.' }
        }
        const home = claudeHomeOf()
        const raw = invocation.rawInput.trim()
        if (raw.length === 0) return { kind: 'success', text: describeRules(workspace, home) }

        const toUser = /^--user\s+/u.test(raw)
        const command = toUser ? raw.replace(/^--user\s+/u, '').trim() : raw
        if (command.length === 0) return { kind: 'error', text: 'Usage: `/allow [--user] <command line>`' }

        const derived = ruleForCommand(command)
        if (derived === undefined) {
          return { kind: 'error', text: `Cannot derive a rule for "${command}".` }
        }
        const path = toUser ? `${home}/settings.json` : projectRulesPath(workspace)
        try {
          const added = appendAllowRule(path, derived.entry)
          return {
            kind: 'success',
            text: added
              ? `Added ${derived.entry} to ${path}. Commands of this family no longer ask.`
              : `${derived.entry} is already allowed in ${path}.`,
          }
        } catch (error) {
          return { kind: 'error', text: `Could not write ${path}: ${error instanceof Error ? error.message : String(error)}` }
        }
      },
    }), 'permission-whitelist: /allow command')
  })
}

export { claudeHome }