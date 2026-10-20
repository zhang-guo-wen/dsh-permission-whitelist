/**
 * Claude Code permission rules for DeepSeek Harness.
 *
 * The plugin reads `permissions.allow` / `ask` / `deny` from Claude Code
 * settings and answers shell and file tool calls from them before execution:
 * a matching `deny` stops the call, a matching `ask` keeps the normal approval
 * prompt, and a matching `allow` hands back `{ kind: 'allow' }`, which
 * short-circuits every other pre-execute listener and its approval prompt.
 *
 * An allowed command also runs outside the file sandbox, because the decision
 * has no channel for a per-call sandbox mode: the gate writes the session's
 * `sandbox/mode` override with the `danger-full-access` setter before the call
 * and restores the previous mode when that call settles, so the widening covers
 * exactly one command. Allowing a command without letting it complete would fail
 * it silently, which is the outcome this file exists to remove. Commands whose
 * segments call a nested shell or interpreter stay confined, since their real
 * effect is invisible to the rule matcher.
 *
 * @module @guowenzhang/dsh-permission-whitelist
 */

import { relative, resolve } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { commandMatcher, decideCommand, pathMatcher, type PermissionRule } from './rules.ts'
import { loadSettings } from './settings.ts'
import { claudeHome } from './settings.ts'
import { registerAllowCommand } from './command.ts'
import { PermissionWhitelistService } from './service.ts'

// The `sandbox/mode` write path is the one harness export this plugin calls.
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'

export const name = 'permission-whitelist'

/**
 * `sessionProjections` carries the `sandbox/mode` fold the sandbox policy
 * reads; `tools` is the interception registry. Both are services the gate
 * cannot work without.
 */
export const inject = ['tools', 'sessionProjections']

/** Plugin configuration. */
export interface Config {
  /**
   * Directory holding the user-level `settings.json`. Defaults to
   * `$CLAUDE_CONFIG_DIR`, then `$CLAUDE_HOME`, then `~/.claude` — the same
   * resolution Claude Code uses.
   */
  claudeHome: string
  /**
   * The allowlist master switch.
   *
   * On: a matching `allow` entry answers the call before execution AND runs it
   * outside the file sandbox, which is what makes the answer useful — an
   * allowlisted command that still hit the sandbox wall would fail without ever
   * asking, the worst of both outcomes. `deny` and `ask` entries apply either
   * way, because they only restrict.
   *
   * Off: every call falls through to the harness default (sandbox + approval
   * prompt), so the file behaves as if this plugin were absent.
   *
   * Volatile, so the settings-page switch reaches the running gate without a
   * remount, matching how the Claude compatibility row declares its switches.
   * @default true
   */
  enabled: Volatile<boolean>
  /** Whether to log each decision. Useful while tuning rules. @default true */
  logDecisions: Volatile<boolean>
}

/**
 * Configuration schema. It deliberately carries no `z<Config>` annotation: the
 * annotation cannot express a volatile field's output type, while the Loader
 * validates through the schema itself. This mirrors the host's own volatile
 * configuration rows.
 */
export const Config = z.object({
  claudeHome: z.string().description('Directory holding the user-level settings.json; defaults to $CLAUDE_CONFIG_DIR, then $CLAUDE_HOME, then ~/.claude.'),
  enabled: z.boolean().default(true).volatile()
    .description('Apply the permission allowlist: allowed commands run without asking and outside the file sandbox.'),
  logDecisions: z.boolean().default(true).volatile()
    .description('Log each allow, ask, and deny decision.'),
})

/** Argument names that carry the path a file tool targets. */
const PATH_ARGUMENTS: readonly string[] = ['file_path', 'path', 'target_file']

/** Argument name that carries the command a shell tool runs. */
const COMMAND_ARGUMENT = 'command'

/**
 * Shell tools a `Bash(...)` rule governs. Claude Code has one shell tool named
 * `Bash`; the harness has `bash` on POSIX and `pwsh` on Windows, and a user
 * writing `Bash(pnpm test *)` expects it to cover whichever shell the host runs.
 */
const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'pwsh'])

/** The calling session's workspace directory, or undefined for an agentless call. */
function workspaceOf(exec: ToolExecution): string | undefined {
  const cwd = exec.agent?.session.header.cwd
  return cwd === undefined ? undefined : resolve(cwd)
}

/**
 * Workspace of the most recent tool call, used by the Remote write method.
 *
 * The Remote protocol carries no Session identity, so the method cannot look the
 * workspace up itself. The gate runs for every tool call before any approval, so
 * recording it there names the project whose approval is now waiting.
 */
let waitingWorkspace: string | undefined

/**
 * Select the rules that constrain one tool. A `bash` rule also constrains
 * `pwsh`, because both are the host's shell tool and Claude Code has no
 * separate spelling for either.
 * @param rules - every parsed rule in force.
 * @param tool - the executing tool's name.
 * @returns the tool's rules, deny first.
 */
function rulesFor(tool: string, rules: readonly PermissionRule[]): PermissionRule[] {
  const names = shellToolFor(tool) ? ['bash', 'pwsh'] : [tool]
  return rules.filter(rule => names.includes(rule.tool))
}

/** Whether a tool name is one of the host's shell tools. */
function shellToolFor(tool: string): boolean {
  return SHELL_TOOLS.has(tool.toLowerCase())
}

/** The path a file tool's arguments name, when one is present. */
function targetPathOf(argumentsValue: unknown): string | undefined {
  if (typeof argumentsValue !== 'object' || argumentsValue === null) return undefined
  const record = argumentsValue as Record<string, unknown>
  for (const key of PATH_ARGUMENTS) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/** The command line a shell tool's arguments carry, when one is present. */
function commandOf(argumentsValue: unknown): string | undefined {
  if (typeof argumentsValue !== 'object' || argumentsValue === null) return undefined
  const value = (argumentsValue as Record<string, unknown>)[COMMAND_ARGUMENT]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

/**
 * Install the permission gate.
 * @param ctx - the plugin context owning the listener.
 * @param config - target `settings.json` directory and bypass options.
 */
export function apply(ctx: Context, config: Config): void {
  // Volatile references: read `.get()` on every call so the settings-page
  // switch takes effect without reloading the plugin.
  const allowlistEnabled = (): boolean => config.enabled.get() !== false
  const logDecisions = (): boolean => config.logDecisions.get() !== false

  /** Calls whose sandbox was widened by this plugin, keyed by call id. */
  const pendingRestores = new Map<string, { session: ToolExecution['agent'] extends undefined ? never : NonNullable<ToolExecution['agent']>['session']; previous: SandboxMode }>()

  /**
   * Restore the mode one bypassed call widened, once that call settles. The
   * `tools/result` event carries the same call id the gate recorded, so a
   * concurrent call cannot restore the other's override.
   */
  ctx.effect(() => ctx.on('tools/result', (exec) => {
    const pending = pendingRestores.get(String(exec.callId))
    if (pending === undefined) return undefined
    pendingRestores.delete(String(exec.callId))
    setSandboxMode(pending.session, pending.previous)
    audit(`sandbox restored to ${pending.previous} after call ${exec.callId}`)
    return undefined
  }), 'permission-whitelist: sandbox restore')

  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    // Remember whose call is in flight: if it goes on to raise an approval, the
    // floating action writes the rule into *that* project's settings file. The
    // Remote method cannot see the Session, so this is the only accurate link.
    waitingWorkspace = workspaceOf(exec) ?? waitingWorkspace
    // The master switch turns the whole file off: no allow, no ask, no deny.
    if (!allowlistEnabled()) return next()
    if (exec.agent === undefined) return next()
    const workspace = workspaceOf(exec)
    if (workspace === undefined) return next()
    const settings = loadSettings(workspace, config.claudeHome)
    if (settings.rules.length === 0) return next()

    const toolRules = rulesFor(exec.name, settings.rules)
    if (toolRules.length === 0) return next()

    const shell = shellToolFor(exec.name)
    const command = shell ? commandOf(exec.arguments) : targetPathOf(exec.arguments)
    if (command === undefined) return next()

    if (!shell) return decidePath(exec, toolRules, command, next)

    const decision = decideCommand(toolRules, command)
    if (decision.kind === undefined) return next()
    if (decision.kind === 'deny') {
      audit(`denied ${exec.name} (${decision.detail ?? 'deny rule'})`)
      return { kind: 'deny', reason: `Permission settings deny this command: ${decision.detail ?? 'deny rule'}` }
    }
    if (decision.kind === 'ask') {
      audit(`asking for ${exec.name}: ${decision.detail ?? 'ask rule'}`)
      return next()
    }
    audit(`allowed ${exec.name}: ${decision.detail ?? 'allow rule'}`)
    // An `allow` entry means "trust this command", so it must actually let the
    // command complete. A body that still hit the sandbox wall would fail
    // without ever asking — the one outcome the allowlist exists to prevent.
    // A segment whose effect the matcher cannot see (a nested interpreter, a
    // redirection) stays confined instead: there the rule did not establish
    // what the command does.
    if (!decision.bypassable || exec.agent === undefined) return { kind: 'allow' }
    return allowOutsideSandbox(exec)
  }), 'permission-whitelist: pre-execute gate')

  /** Audit line routed to the host log; the model never sees it. */
  function audit(message: string): void {
    if (logDecisions()) ctx.logger.info(`permission-whitelist: ${message}`)
  }

  /**
   * Record an "always allow" decision for one command, and describe the rule it
   * would add. The approval card runs in the browser, so this crosses the wire
   * as a Typert remote method; the write policy stays on the Host.
   *
   * Mounted inside `ctx.inject` because a headless composition may have no
   * gateway to register against; the gate above must work either way.
   */
  ctx.inject(['typertGateway'], (scope) => {
    new PermissionWhitelistService(scope, () => waitingWorkspace)
  })

  // The approval panel offers no extension point for a third action, so the
  // allowlist is authored from the composer instead.
  registerAllowCommand(ctx, () => config.claudeHome ?? claudeHome())

  /** Decide a file tool's target path against the same rule lists. */
  async function decidePath(
    exec: ToolExecution,
    toolRules: readonly PermissionRule[],
    path: string,
    next: () => Promise<PreToolDecision>,
  ): Promise<PreToolDecision> {
    const workspace = workspaceOf(exec) as string
    const absolutePath = resolve(workspace, path).replace(/\\/gu, '/')
    const relativePath = relative(workspace, resolve(workspace, path)).replace(/\\/gu, '/')
    const matchedBy = (kind: PermissionRule['kind']): PermissionRule | undefined =>
      toolRules.find(rule => rule.kind === kind && pathMatcher(rule.specifier)(relativePath, absolutePath))
    const denied = matchedBy('deny')
    if (denied !== undefined) {
      audit(`denied path ${absolutePath} via ${denied.tool}(${denied.specifier})`)
      return { kind: 'deny', reason: `Permission settings deny this path: ${denied.tool}(${denied.specifier})` }
    }
    if (matchedBy('ask') !== undefined) return next()
    const allowed = matchedBy('allow')
    if (allowed !== undefined) {
      audit(`allowed path ${absolutePath} via ${allowed.tool}(${allowed.specifier})`)
      // The same reasoning as the command gate: an allow that still hits the
      // sandbox wall leaves the call failing without ever asking, which is the
      // outcome this file exists to remove.
      return allowOutsideSandbox(exec)
    }
    return next()
  }

  /**
   * Run one allowed command outside the sandbox.
   *
   * A pre-execute decision has no field for a per-call mode, so the gate writes
   * the session override and returns `allow` directly. The tool body resolves
   * that mode when it starts, and the `tools/result` listener restores the
   * previous mode once the call settles — so the bypass covers exactly one
   * command, including a long-running one.
   *
   * `next()` is deliberately not awaited: a later pre-execute listener would
   * re-read the overridden mode, and the allow already won.
   * @param exec - the allowed call whose session carries the override.
   * @returns the allow decision; the restore is armed for this call id.
   */
  async function allowOutsideSandbox(exec: ToolExecution): Promise<PreToolDecision> {
    const agent = exec.agent
    if (agent === undefined) return { kind: 'allow' }
    const session = agent.session
    const sandboxPolicy = ctx.get('sandboxPolicy') as { resolve(request?: { session?: unknown }): SandboxExecutionPolicy } | undefined
    const previous: SandboxMode | undefined = sandboxPolicy?.resolve({ session }).mode
    if (previous === undefined || previous === 'danger-full-access') return { kind: 'allow' }
    setSandboxMode(session, 'danger-full-access')
    audit(`sandbox bypass for one ${exec.name} call ${exec.callId} (${previous} -> danger-full-access)`)
    pendingRestores.set(String(exec.callId), { session, previous })
    return { kind: 'allow' }
  }
}