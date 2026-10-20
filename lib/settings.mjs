import { parseRule } from "./rules.mjs";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
//#region src/settings.ts
/**
* Load Claude Code permission settings: the user-level `~/.claude/settings.json`
* and, beneath it, any project-level `.claude/settings.local.json` and
* `.claude/settings.json`. A missing or malformed file contributes no rules and
* never aborts loading, so a broken settings file degrades to "no allowlist"
* rather than to an unguarded or a blocked session.
*
* @module @guowenzhang/dsh-permission-whitelist/settings
*/
/** Project-relative settings files, lowest precedence first. */
const PROJECT_SETTINGS_FILES = [join(".claude", "settings.json"), join(".claude", "settings.local.json")];
/** Lists a settings object may carry, in the order they are read. */
const RULE_LISTS = [
	"allow",
	"ask",
	"deny"
];
/**
* Resolve the Claude Code home directory, honoring the same variables Claude
* Code itself reads.
* @returns the absolute config directory.
*/
function claudeHome() {
	return resolve(process.env["CLAUDE_CONFIG_DIR"] ?? process.env["CLAUDE_HOME"] ?? join(homedir(), ".claude"));
}
/**
* Read one settings file's `permissions` lists.
* @param path - absolute settings path.
* @returns the parsed rules (possibly empty).
*/
function readRuleFile(path) {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return [];
	}
	const permissions = parsed?.permissions;
	if (typeof permissions !== "object" || permissions === null) return [];
	const collected = [];
	for (const kind of RULE_LISTS) {
		const list = permissions[kind];
		if (!Array.isArray(list)) continue;
		for (const entry of list) {
			if (typeof entry !== "string") continue;
			const rule = parseRule(kind, entry);
			if (rule !== void 0) collected.push(rule);
		}
	}
	return collected;
}
/**
* Load every settings file that applies to one workspace. The workspace root is
* the session's own directory, so a nested repository does not inherit its
* parent's allowlist.
* @param workspaceRoot - absolute session workspace directory.
* @param home - the Claude Code config directory.
* @returns the rules in force plus the files that supplied them.
*/
function loadSettings(workspaceRoot, home = claudeHome()) {
	const rules = [];
	const sources = [];
	const files = [join(home, "settings.json"), ...PROJECT_SETTINGS_FILES.map((file) => join(workspaceRoot, file))];
	for (const file of files) {
		const fromFile = readRuleFile(file);
		if (fromFile.length === 0) continue;
		rules.push(...fromFile);
		sources.push(file);
	}
	const rank = (kind) => kind === "deny" ? 0 : kind === "ask" ? 1 : 2;
	return {
		rules: [...rules].sort((left, right) => rank(left.kind) - rank(right.kind)),
		sources
	};
}
//#endregion
export { claudeHome, loadSettings };
