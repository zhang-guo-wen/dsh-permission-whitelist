/**
 * Host-side remote methods for the browser surfaces.
 *
 * The approval card and the settings section live in the browser process, which
 * cannot touch the Host filesystem. `AppendAllowRule` is therefore a Typert
 * remote method: the browser names the command and the target file, and the
 * write policy (which rule to derive, whether the entry is already present,
 * how the previous bytes are preserved) stays here on the Host.
 *
 * @module @guowenzhang/dsh-permission-whitelist/service
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { appendAllowRule, projectRulesPath, ruleForCommand } from './writer.ts'

/** Namespace the browser mounts and addresses. */
export const REMOTE_NAMESPACE = 'permissionWhitelist'

/** What the browser sends when "always allow" is clicked. */
export interface AppendAllowRuleRequest {
  /** The exact command line the approval was raised for. */
  command: string
  /** Target settings file; the user settings file is used when omitted. */
  settingsPath?: string
}

/** What came back after the write. */
export interface AppendAllowRuleResult {
  /** The settings entry that now covers the command, e.g. `Bash(pnpm test *)`. */
  entry: string
  /** Whether the entry was newly written (`false` when it was already present). */
  added: boolean
  /** The settings file that was updated. */
  settingsPath: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    permissionWhitelist: PermissionWhitelistService
  }
}

/**
 * Remote write surface. Constructing it registers the namespace; the browser
 * reaches it through `ctx.remote.$mount(TYPERT_REMOTE)`.
 */
export class PermissionWhitelistService extends TypertRemoteService {
  /**
   * @param ctx - the owning plugin context.
   * @param workspaceOf - the workspace of the Session whose call is waiting, so
   * a rule lands in that project's `.claude/settings.json` rather than in the
   * user's global file.
   */
  constructor(ctx: Context, readonly workspaceOf: () => string | undefined) {
    super(ctx, REMOTE_NAMESPACE)
  }

  /**
   * Report the rule an "always allow" click would add, so the card can show it
   * before the user commits.
   * @param request - the command line to describe.
   * @returns the entry, or `null` when the command yields no safe rule.
   */
  @Remote('previewRule')
  previewRule(request: { command: string }): { entry: string | null } {
    const derived = ruleForCommand(request.command)
    return { entry: derived === undefined ? null : derived.entry }
  }

  /**
   * Append the derived allow rule to the waiting Session's project settings.
   *
   * The rule belongs to the project whose call raised the approval, not to the
   * user's global configuration: that is where a project's conventions live and
   * it keeps one project's commands from widening every other project. An
   * explicit path wins when the caller supplies one.
   * @param request - the command plus an optional explicit settings file.
   * @returns the entry written, whether it was new, and where it landed.
   */
  @Remote('appendAllowRule')
  appendAllowRule(request: AppendAllowRuleRequest): AppendAllowRuleResult {
    const derived = ruleForCommand(request.command)
    if (derived === undefined) throw new Error('this command cannot be reduced to a rule')
    const workspace = this.workspaceOf()
    if (request.settingsPath === undefined && workspace === undefined) {
      throw new Error('no session workspace is known, so there is no project settings file to extend')
    }
    const settingsPath = request.settingsPath ?? projectRulesPath(workspace as string)
    const added = appendAllowRule(settingsPath, derived.entry)
    return { entry: derived.entry, added, settingsPath }
  }
}