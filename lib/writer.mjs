import { dirname } from "node:path";
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
//#region src/writer.ts
/**
* Rule derivation and the one write path into Claude Code settings.
*
* Two problems shape this module. First, an "always allow" click must not paste
* the whole command line into the allowlist: that line carries this call's
* arguments and paths, so the next similar call would not match, and a
* one-off path would become permanently allowed. The rule is therefore derived
* from the command's program, and how many argument words it keeps depends on
* how many words that program's own family uses for its subcommand
* (`pnpm test …` keeps two, `git push --force …` keeps three).
*
* Second, writing must never corrupt a file the user edits by hand. The target
* is re-read inside the write, the new entry is appended to `permissions.allow`
* only when it is not already present, and the previous bytes are moved aside
* before the replacement is written.
*
* @module @guowenzhang/dsh-permission-whitelist/writer
*/
/** Programs whose first argument is a subcommand rather than a flag or a value. */
const SUBCOMMAND_PROGRAMS = /* @__PURE__ */ new Set([
	"git",
	"pnpm",
	"npm",
	"npx",
	"yarn",
	"bun",
	"deno",
	"cargo",
	"go",
	"docker",
	"kubectl",
	"gh",
	"dotnet",
	"pip",
	"pip3",
	"python",
	"python3",
	"uv",
	"poetry",
	"gradle",
	"mvn"
]);
/** Shell words that are flags rather than positional names. */
function isFlag(word) {
	return word.startsWith("-") || word.startsWith("/");
}
/**
* Derive the narrowest useful allow rule for one command.
*
* The program word is always kept. A subcommand is kept when the program uses
* one and the argument is not a flag. Deeper arguments are never kept, and the
* entry always ends in a wildcard so later invocations of the same family match.
* @param command - the command line the approval was raised for.
* @returns the derived entry, or undefined when no safe rule can be derived.
*/
function ruleForCommand(command) {
	const words = command.trim().split(/\s+/u).filter((word) => word.length > 0);
	const program = words[0]?.replace(/^["']|["']$/gu, "");
	if (program === void 0 || program.length === 0) return void 0;
	if (!PROGRAM_TOKEN.test(program)) return void 0;
	const kept = [program];
	if (SUBCOMMAND_PROGRAMS.has(program.toLowerCase())) {
		const next = words[1];
		if (next !== void 0 && !isFlag(next) && /^[A-Za-z][A-Za-z0-9:_-]*$/u.test(next)) kept.push(next);
	}
	return {
		entry: `Bash(${kept.join(" ")} *)`,
		wildcard: true
	};
}
/**
* What a program token may contain: an executable name or a path to one. It must
* start with an ASCII letter, digit, `_`, `.`, or path separator, which excludes
* localized prose and punctuation.
*/
const PROGRAM_TOKEN = /^[A-Za-z0-9_./\\~:-]+$/u;
/** Whether a string already appears in one settings list. */
function hasEntry(list, entry) {
	return list.some((item) => typeof item === "string" && item.trim() === entry);
}
/** Read one settings document, treating an absent file as an empty object. */
function readDocument(path) {
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return {};
	}
	if (text.trim().length === 0) return {};
	const parsed = JSON.parse(text);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${path} is not a JSON object`);
	return parsed;
}
/**
* Append one allow entry to a Claude Code settings file.
*
* The document is re-read at write time so rules added by another click (or by
* hand, while the dialog was open) survive. An entry that is already present is
* a no-op rather than a duplicate.
* @param path - absolute settings file path; the parent directory is created.
* @param entry - the settings entry to append.
* @returns whether the file changed.
*/
function appendAllowRule(path, entry) {
	const document = readDocument(path);
	const permissionsValue = document["permissions"];
	const permissions = typeof permissionsValue === "object" && permissionsValue !== null && !Array.isArray(permissionsValue) ? permissionsValue : {};
	const allowValue = permissions["allow"];
	const allow = Array.isArray(allowValue) ? allowValue : [];
	if (hasEntry(allow, entry)) return false;
	document["permissions"] = {
		...permissions,
		allow: [...allow, entry]
	};
	mkdirSync(dirname(path), { recursive: true });
	const text = `${JSON.stringify(document, null, 2)}\n`;
	try {
		copyFileSync(path, `${path}.bak-${Date.now()}`);
	} catch {}
	const temporary = `${path}.tmp-${Date.now()}`;
	writeFileSync(temporary, text, "utf8");
	renameSync(temporary, path);
	return true;
}
/** Resolve the project rules file for a workspace (`<workspace>/.claude/settings.json`). */
function projectRulesPath(workspace) {
	return `${workspace.replace(/[\\/]+$/u, "")}/.claude/settings.json`;
}
//#endregion
export { appendAllowRule, projectRulesPath, ruleForCommand };
