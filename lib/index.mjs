import { decideCommand, pathMatcher } from "./rules.mjs";
import { claudeHome, loadSettings } from "./settings.mjs";
import { appendAllowRule, projectRulesPath, ruleForCommand } from "./writer.mjs";
import { relative, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { setSandboxMode } from "@deepseek-ai/dsh-sandbox-policy";
//#region src/command.ts
/** Command name without the leading slash. */
const ALLOW_COMMAND = "allow";
/** The workspace a command invocation came from, or undefined when unknown. */
function workspaceOf$1(agent) {
	const cwd = agent.session.header.cwd;
	return cwd === void 0 ? void 0 : cwd;
}
/**
* Render the rules currently in force, so a user can inspect the whitelist
* without opening the settings file by hand.
* @param workspace - the session workspace.
* @param home - the Claude Code config directory.
* @returns a human-readable summary.
*/
function describeRules(workspace, home) {
	const loaded = loadSettings(workspace, home);
	if (loaded.rules.length === 0) return "No permission rules yet. Add one with `/allow <command>`, for example `/allow pnpm test`.";
	return `Permission rules in force:\n${loaded.rules.map((rule) => `${rule.kind.padEnd(5)} ${rule.tool}(${rule.specifier})`).join("\n")}\nSources: ${loaded.sources.join(", ")}`;
}
/**
* Register the `/allow` command when the composition mounts a command registry.
* @param ctx - plugin context.
* @param claudeHomeOf - resolves the Claude Code config directory for this deployment.
*/
function registerAllowCommand(ctx, claudeHomeOf) {
	ctx.inject(["commands"], (scope) => {
		const commands = scope.commands;
		scope.effect(() => commands.register({
			name: ALLOW_COMMAND,
			description: "Add a command to the permission allowlist, or list the current rules.",
			input: { hint: "[--user] <command line>" },
			recordInput: true,
			handler: (invocation) => {
				const workspace = workspaceOf$1(invocation.agent);
				if (workspace === void 0) return {
					kind: "error",
					text: "This session has no workspace directory to store a rule in."
				};
				const home = claudeHomeOf();
				const raw = invocation.rawInput.trim();
				if (raw.length === 0) return {
					kind: "success",
					text: describeRules(workspace, home)
				};
				const toUser = /^--user\s+/u.test(raw);
				const command = toUser ? raw.replace(/^--user\s+/u, "").trim() : raw;
				if (command.length === 0) return {
					kind: "error",
					text: "Usage: `/allow [--user] <command line>`"
				};
				const derived = ruleForCommand(command);
				if (derived === void 0) return {
					kind: "error",
					text: `Cannot derive a rule for "${command}".`
				};
				const path = toUser ? `${home}/settings.json` : projectRulesPath(workspace);
				try {
					return {
						kind: "success",
						text: appendAllowRule(path, derived.entry) ? `Added ${derived.entry} to ${path}. Commands of this family no longer ask.` : `${derived.entry} is already allowed in ${path}.`
					};
				} catch (error) {
					return {
						kind: "error",
						text: `Could not write ${path}: ${error instanceof Error ? error.message : String(error)}`
					};
				}
			}
		}), "permission-whitelist: /allow command");
	});
}
//#endregion
//#region src/service.ts
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
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Namespace the browser mounts and addresses. */
const REMOTE_NAMESPACE = "permissionWhitelist";
/**
* Remote write surface. Constructing it registers the namespace; the browser
* reaches it through `ctx.remote.$mount(TYPERT_REMOTE)`.
*/
let PermissionWhitelistService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _previewRule_decorators;
	let _appendAllowRule_decorators;
	return class PermissionWhitelistService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_previewRule_decorators = [Remote("previewRule")];
			_appendAllowRule_decorators = [Remote("appendAllowRule")];
			__esDecorate(this, null, _previewRule_decorators, {
				kind: "method",
				name: "previewRule",
				static: false,
				private: false,
				access: {
					has: (obj) => "previewRule" in obj,
					get: (obj) => obj.previewRule
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _appendAllowRule_decorators, {
				kind: "method",
				name: "appendAllowRule",
				static: false,
				private: false,
				access: {
					has: (obj) => "appendAllowRule" in obj,
					get: (obj) => obj.appendAllowRule
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		workspaceOf = __runInitializers(this, _instanceExtraInitializers);
		/**
		* @param ctx - the owning plugin context.
		* @param workspaceOf - the workspace of the Session whose call is waiting, so
		* a rule lands in that project's `.claude/settings.json` rather than in the
		* user's global file.
		*/
		constructor(ctx, workspaceOf) {
			super(ctx, REMOTE_NAMESPACE);
			this.workspaceOf = workspaceOf;
		}
		/**
		* Report the rule an "always allow" click would add, so the card can show it
		* before the user commits.
		* @param request - the command line to describe.
		* @returns the entry, or `null` when the command yields no safe rule.
		*/
		previewRule(request) {
			const derived = ruleForCommand(request.command);
			return { entry: derived === void 0 ? null : derived.entry };
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
		appendAllowRule(request) {
			const derived = ruleForCommand(request.command);
			if (derived === void 0) throw new Error("this command cannot be reduced to a rule");
			const workspace = this.workspaceOf();
			if (request.settingsPath === void 0 && workspace === void 0) throw new Error("no session workspace is known, so there is no project settings file to extend");
			const settingsPath = request.settingsPath ?? projectRulesPath(workspace);
			const added = appendAllowRule(settingsPath, derived.entry);
			return {
				entry: derived.entry,
				added,
				settingsPath
			};
		}
	};
})();
//#endregion
//#region src/index.ts
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
const name = "permission-whitelist";
/**
* `sessionProjections` carries the `sandbox/mode` fold the sandbox policy
* reads; `tools` is the interception registry. Both are services the gate
* cannot work without.
*/
const inject = ["tools", "sessionProjections"];
/**
* Configuration schema. It deliberately carries no `z<Config>` annotation: the
* annotation cannot express a volatile field's output type, while the Loader
* validates through the schema itself. This mirrors the host's own volatile
* configuration rows.
*/
const Config = z.object({
	claudeHome: z.string().description("Directory holding the user-level settings.json; defaults to $CLAUDE_CONFIG_DIR, then $CLAUDE_HOME, then ~/.claude."),
	enabled: z.boolean().default(true).volatile().description("Apply the permission allowlist: allowed commands run without asking and outside the file sandbox."),
	logDecisions: z.boolean().default(true).volatile().description("Log each allow, ask, and deny decision.")
});
/** Argument names that carry the path a file tool targets. */
const PATH_ARGUMENTS = [
	"file_path",
	"path",
	"target_file"
];
/** Argument name that carries the command a shell tool runs. */
const COMMAND_ARGUMENT = "command";
/**
* Shell tools a `Bash(...)` rule governs. Claude Code has one shell tool named
* `Bash`; the harness has `bash` on POSIX and `pwsh` on Windows, and a user
* writing `Bash(pnpm test *)` expects it to cover whichever shell the host runs.
*/
const SHELL_TOOLS = /* @__PURE__ */ new Set(["bash", "pwsh"]);
/** The calling session's workspace directory, or undefined for an agentless call. */
function workspaceOf(exec) {
	const cwd = exec.agent?.session.header.cwd;
	return cwd === void 0 ? void 0 : resolve(cwd);
}
/**
* Workspace of the most recent tool call, used by the Remote write method.
*
* The Remote protocol carries no Session identity, so the method cannot look the
* workspace up itself. The gate runs for every tool call before any approval, so
* recording it there names the project whose approval is now waiting.
*/
let waitingWorkspace;
/**
* Select the rules that constrain one tool. A `bash` rule also constrains
* `pwsh`, because both are the host's shell tool and Claude Code has no
* separate spelling for either.
* @param rules - every parsed rule in force.
* @param tool - the executing tool's name.
* @returns the tool's rules, deny first.
*/
function rulesFor(tool, rules) {
	const names = shellToolFor(tool) ? ["bash", "pwsh"] : [tool];
	return rules.filter((rule) => names.includes(rule.tool));
}
/** Whether a tool name is one of the host's shell tools. */
function shellToolFor(tool) {
	return SHELL_TOOLS.has(tool.toLowerCase());
}
/** The path a file tool's arguments name, when one is present. */
function targetPathOf(argumentsValue) {
	if (typeof argumentsValue !== "object" || argumentsValue === null) return void 0;
	const record = argumentsValue;
	for (const key of PATH_ARGUMENTS) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
}
/** The command line a shell tool's arguments carry, when one is present. */
function commandOf(argumentsValue) {
	if (typeof argumentsValue !== "object" || argumentsValue === null) return void 0;
	const value = argumentsValue[COMMAND_ARGUMENT];
	return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
/**
* Install the permission gate.
* @param ctx - the plugin context owning the listener.
* @param config - target `settings.json` directory and bypass options.
*/
function apply(ctx, config) {
	const allowlistEnabled = () => config.enabled.get() !== false;
	const logDecisions = () => config.logDecisions.get() !== false;
	/** Calls whose sandbox was widened by this plugin, keyed by call id. */
	const pendingRestores = /* @__PURE__ */ new Map();
	/**
	* Restore the mode one bypassed call widened, once that call settles. The
	* `tools/result` event carries the same call id the gate recorded, so a
	* concurrent call cannot restore the other's override.
	*/
	ctx.effect(() => ctx.on("tools/result", (exec) => {
		const pending = pendingRestores.get(String(exec.callId));
		if (pending === void 0) return void 0;
		pendingRestores.delete(String(exec.callId));
		setSandboxMode(pending.session, pending.previous);
		audit(`sandbox restored to ${pending.previous} after call ${exec.callId}`);
	}), "permission-whitelist: sandbox restore");
	ctx.effect(() => ctx.on("tools/pre-execute", async (exec, next) => {
		waitingWorkspace = workspaceOf(exec) ?? waitingWorkspace;
		if (!allowlistEnabled()) return next();
		if (exec.agent === void 0) return next();
		const workspace = workspaceOf(exec);
		if (workspace === void 0) return next();
		const settings = loadSettings(workspace, config.claudeHome);
		if (settings.rules.length === 0) return next();
		const toolRules = rulesFor(exec.name, settings.rules);
		if (toolRules.length === 0) return next();
		const shell = shellToolFor(exec.name);
		const command = shell ? commandOf(exec.arguments) : targetPathOf(exec.arguments);
		if (command === void 0) return next();
		if (!shell) return decidePath(exec, toolRules, command, next);
		const decision = decideCommand(toolRules, command);
		if (decision.kind === void 0) return next();
		if (decision.kind === "deny") {
			audit(`denied ${exec.name} (${decision.detail ?? "deny rule"})`);
			return {
				kind: "deny",
				reason: `Permission settings deny this command: ${decision.detail ?? "deny rule"}`
			};
		}
		if (decision.kind === "ask") {
			audit(`asking for ${exec.name}: ${decision.detail ?? "ask rule"}`);
			return next();
		}
		audit(`allowed ${exec.name}: ${decision.detail ?? "allow rule"}`);
		if (!decision.bypassable || exec.agent === void 0) return { kind: "allow" };
		return allowOutsideSandbox(exec);
	}), "permission-whitelist: pre-execute gate");
	/** Audit line routed to the host log; the model never sees it. */
	function audit(message) {
		if (logDecisions()) ctx.logger.info(`permission-whitelist: ${message}`);
	}
	/**
	* Record an "always allow" decision for one command, and describe the rule it
	* would add. The approval card runs in the browser, so this crosses the wire
	* as a Typert remote method; the write policy stays on the Host.
	*
	* Mounted inside `ctx.inject` because a headless composition may have no
	* gateway to register against; the gate above must work either way.
	*/
	ctx.inject(["typertGateway"], (scope) => {
		new PermissionWhitelistService(scope, () => waitingWorkspace);
	});
	registerAllowCommand(ctx, () => config.claudeHome ?? claudeHome());
	/** Decide a file tool's target path against the same rule lists. */
	async function decidePath(exec, toolRules, path, next) {
		const workspace = workspaceOf(exec);
		const absolutePath = resolve(workspace, path).replace(/\\/gu, "/");
		const relativePath = relative(workspace, resolve(workspace, path)).replace(/\\/gu, "/");
		const matchedBy = (kind) => toolRules.find((rule) => rule.kind === kind && pathMatcher(rule.specifier)(relativePath, absolutePath));
		const denied = matchedBy("deny");
		if (denied !== void 0) {
			audit(`denied path ${absolutePath} via ${denied.tool}(${denied.specifier})`);
			return {
				kind: "deny",
				reason: `Permission settings deny this path: ${denied.tool}(${denied.specifier})`
			};
		}
		if (matchedBy("ask") !== void 0) return next();
		const allowed = matchedBy("allow");
		if (allowed !== void 0) {
			audit(`allowed path ${absolutePath} via ${allowed.tool}(${allowed.specifier})`);
			return allowOutsideSandbox(exec);
		}
		return next();
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
	async function allowOutsideSandbox(exec) {
		const agent = exec.agent;
		if (agent === void 0) return { kind: "allow" };
		const session = agent.session;
		const previous = ctx.get("sandboxPolicy")?.resolve({ session }).mode;
		if (previous === void 0 || previous === "danger-full-access") return { kind: "allow" };
		setSandboxMode(session, "danger-full-access");
		audit(`sandbox bypass for one ${exec.name} call ${exec.callId} (${previous} -> danger-full-access)`);
		pendingRestores.set(String(exec.callId), {
			session,
			previous
		});
		return { kind: "allow" };
	}
}
//#endregion
export { Config, apply, inject, name };
