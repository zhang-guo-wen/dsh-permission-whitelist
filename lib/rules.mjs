//#region src/rules.ts
/** Rules in precedence order: deny beats ask beats allow. */
const RULE_PRECEDENCE = [
	"deny",
	"ask",
	"allow"
];
/** Shell or interpreter programs whose arguments are themselves executable. */
const NESTED_EXECUTION_PROGRAMS = /* @__PURE__ */ new Set([
	"bash",
	"sh",
	"zsh",
	"fish",
	"dash",
	"ksh",
	"pwsh",
	"powershell",
	"cmd",
	"cmd.exe",
	"node",
	"deno",
	"bun",
	"python",
	"python3",
	"py",
	"ruby",
	"perl",
	"php",
	"Rscript",
	"eval",
	"exec",
	"invoke-expression",
	"iex",
	"invoke-command",
	"start-process"
]);
/**
* Wrappers that run the rest of the segment as a program. Their argv prefixes
* are skipped before the program word is compared, so `env FOO=1 pnpm test`
* matches a `Bash(pnpm test)` rule.
*/
const PROGRAM_WRAPPERS = /* @__PURE__ */ new Set([
	"env",
	"sudo",
	"doas",
	"time",
	"nice",
	"nohup",
	"command",
	"builtin",
	"exec",
	"gtimeout",
	"timeout"
]);
/** Argument shapes that make a wrapper consume flags before the program word. */
const WRAPPER_FLAG_PREFIXES = /* @__PURE__ */ new Set([
	"sudo",
	"time",
	"nice",
	"timeout",
	"gtimeout"
]);
/** Quote characters a shell honors inside a command line. */
const QUOTE_CHARACTERS = /* @__PURE__ */ new Set([
	"\"",
	"'",
	"`"
]);
/**
* Characters that start or contain a shell construct whose effect the rule
* vocabulary cannot describe (substitution, chaining, redirection, a comment).
* A segment containing one is never eligible for an allow.
*/
const UNREPRESENTABLE_CONSTRUCTS = /* @__PURE__ */ new Set([
	"$",
	"(",
	")",
	"`",
	">",
	"<",
	"#"
]);
/**
* Split a command line into the segments a shell would execute, keeping quoted
* text intact. The separators are `;`, `&&`, `||`, `|` and newlines.
* @param command - the raw command text from the tool arguments.
* @returns every non-empty segment in source order.
*/
function splitCommandSegments(command) {
	const segments = [];
	let current = "";
	let quote;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (quote !== void 0) {
			current += character;
			if (character === quote) quote = void 0;
			continue;
		}
		if (QUOTE_CHARACTERS.has(character)) {
			quote = character;
			current += character;
			continue;
		}
		if (character === "\n" || character === ";") {
			segments.push(current);
			current = "";
			continue;
		}
		if (character === "&" || character === "|") {
			const next = command[index + 1];
			segments.push(current);
			current = "";
			if (next === character) index += 1;
			continue;
		}
		current += character;
	}
	segments.push(current);
	return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}
/**
* Split a command line like {@link splitCommandSegments} while keeping the
* separator that introduced each segment.
* @param command - the raw command text from the tool arguments.
* @returns every non-empty segment with its separator, in source order.
*/
function splitCommandSegmentsDetailed(command) {
	const segments = [];
	let current = "";
	let separator;
	let quote;
	const flush = (next) => {
		const text = current.trim();
		if (text.length > 0) segments.push({
			text,
			separator
		});
		current = "";
		separator = next;
	};
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (quote !== void 0) {
			current += character;
			if (character === quote) quote = void 0;
			continue;
		}
		if (QUOTE_CHARACTERS.has(character)) {
			quote = character;
			current += character;
			continue;
		}
		if (character === "\n") {
			flush("\n");
			continue;
		}
		if (character === ";") {
			flush(";");
			continue;
		}
		if (character === "&" || character === "|") {
			if (command[index + 1] === character) {
				flush(character === "&" ? "&&" : "||");
				index += 1;
			} else flush(character);
			continue;
		}
		current += character;
	}
	const tail = current.trim();
	if (tail.length > 0) segments.push({
		text: tail,
		separator
	});
	return segments;
}
/**
* Pipe targets that cannot change anything by themselves.
*
* These only reformat or discard what the previous command produced, so they do
* not need their own rule. Script-block cmdlets (`Where-Object`,
* `ForEach-Object`) are deliberately absent: they run arbitrary code.
*/
const HARMLESS_PIPE_TARGETS = /* @__PURE__ */ new Set([
	"out-null",
	"write-output",
	"write-host",
	"format-table",
	"format-list",
	"measure-object",
	"sort-object",
	"select-object",
	"convertto-json",
	"select-string"
]);
/** A bare quoted string or number only prints a value. */
const BARE_LITERAL = /^(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)$/u;
/**
* Decide whether a segment needs a rule of its own.
* @param segment - one detailed segment.
* @returns whether the segment has no effect that a rule must cover.
*/
function isInert(segment) {
	const head = segment.text.split(/\s+/u).filter((word) => word.length > 0)[0];
	if (head === void 0) return true;
	if (BARE_LITERAL.test(head)) return true;
	if (segment.separator !== "|") return false;
	const program = head.replace(/^["']|["']$/gu, "").toLowerCase();
	return HARMLESS_PIPE_TARGETS.has(program);
}
/**
* Remove leading `NAME=value` assignments, because the shell applies them to the
* following program rather than running them, and `FOO=1 git push` would
* otherwise dodge a `Bash(git push:*)` rule.
* @param segment - one segment from {@link splitCommandSegments}.
* @returns the segment beginning at its first word.
*/
function stripLeadingAssignments(segment) {
	let rest = segment.trimStart();
	for (;;) {
		const match = /^[A-Za-z_][A-Za-z0-9_]*=/u.exec(rest);
		if (match === null) return rest;
		const afterName = rest.slice(match[0].length);
		let consumed = 0;
		let quote;
		for (; consumed < afterName.length; consumed += 1) {
			const character = afterName[consumed];
			if (quote !== void 0) {
				if (character === quote) quote = void 0;
				continue;
			}
			if (QUOTE_CHARACTERS.has(character)) {
				quote = character;
				continue;
			}
			if (/\s/u.test(character)) break;
		}
		rest = afterName.slice(consumed).trimStart();
	}
}
/**
* Resolve the program a segment runs after skipping wrapper prefixes.
* @param words - the segment's whitespace-separated words.
* @returns the program word, lowercased, and the index it occupies.
*/
function programWord(words) {
	let index = 0;
	for (;;) {
		const raw = words[index];
		if (raw === void 0) return void 0;
		const word = raw.replace(/^["']|["']$/gu, "").toLowerCase();
		if (!PROGRAM_WRAPPERS.has(word)) return {
			word,
			index
		};
		index += 1;
		if (WRAPPER_FLAG_PREFIXES.has(word)) while (index < words.length) {
			const flag = words[index];
			if (!flag.startsWith("-")) break;
			index += flag === "-u" || flag === "--user" ? 2 : 1;
		}
		while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index])) index += 1;
	}
}
/**
* Describe one segment for matching.
*
* The text handed to the matcher starts at the program word, so a wrapper
* prefix (`sudo -E pnpm test`) and leading assignments (`FOO=1 git push`) cannot
* hide what actually runs. `unsafe` records that the segment still calls a
* nested shell or interpreter, or contains a construct the rule vocabulary
* cannot describe, which keeps an allow from also granting a sandbox bypass.
* @param segment - a trimmed segment from {@link splitCommandSegments}.
* @returns the program-first text plus whether the segment is ineligible for a sandbox bypass.
*/
function describeSegment(segment) {
	const stripped = stripLeadingAssignments(segment);
	const words = stripped.split(/\s+/u).filter((word) => word.length > 0);
	const program = programWord(words);
	const text = program === void 0 ? stripped : words.slice(program.index).join(" ");
	const nested = program !== void 0 && NESTED_EXECUTION_PROGRAMS.has(program.word);
	const unrepresentable = [...text].some((character) => UNREPRESENTABLE_CONSTRUCTS.has(character));
	return {
		text,
		unsafe: nested || unrepresentable
	};
}
/**
* Convert a Claude Code command specifier into a match test.
*
* Two spellings are prefix rules: a trailing `*` with no earlier wildcard, and
* a trailing ` *` that ends a call with arguments (`pnpm test *`, Claude Code's
* common way to allow a command with any arguments). Any other specifier is
* exact. Matching compares whole words, so `git status` never matches
* `git statusx`, and `git *` never matches `gitx`.
* @param specifier - the text inside the rule's parentheses.
* @returns a predicate over a program-first segment.
*/
function commandMatcher(specifier) {
	const wanted = specifier.trim();
	if (wanted === "*" || wanted === "") return () => true;
	const prefix = /^[^*]*\*$/u.test(wanted) || /\s\*$/u.test(wanted);
	const targetWords = (prefix ? wanted.slice(0, -1).trimEnd() : wanted).split(/\s+/u).filter((word) => word.length > 0);
	return (segment) => {
		const words = segment.split(/\s+/u).filter((word) => word.length > 0);
		if (!prefix && targetWords.length !== words.length) return false;
		if (prefix && words.length < targetWords.length) return false;
		return targetWords.every((target, index) => matchWord(target, words[index]));
	};
}
/**
* Compare one specifier word with one segment word.
* @param target - the specifier word, possibly containing `*`.
* @param actual - the segment word.
* @returns whether they match, case-sensitively except on Windows-style paths.
*/
function matchWord(target, actual) {
	if (!target.includes("*")) return target === actual;
	const pattern = target.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join(".*");
	return new RegExp(`^${pattern}$`, "u").test(actual);
}
/**
* Convert a Claude Code file-rule specifier into a match test.
*
* Claude Code's own distinction is honored literally: `//path` is an absolute
* path and `~/path` is home-relative (both match exactly as written), while a
* bare `src/**` is a GLOB PATTERN matched against the path such a call names —
* relative to the session workspace — so `src/**` covers `src/a/b.ts` without
* naming a drive. `**` spans any number of segments, `*` stays inside one.
* @param specifier - the text inside a `Read(...)`/`Edit(...)` rule.
* @returns a predicate taking both the workspace-relative and absolute forms.
*/
function pathMatcher(specifier) {
	const normalized = specifier.trim().replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
	const absoluteRule = normalized.startsWith("/") || normalized.startsWith("~/") || /^[A-Za-z]:\//u.test(normalized);
	const prefix = normalized.endsWith("*") && !normalized.slice(0, -1).includes("*");
	const body = prefix ? normalized.slice(0, -1) : normalized;
	const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const pattern = body.split("**").map((part) => escape(part).split("*").join("[^/]*")).join(".*");
	const test = new RegExp(`^${pattern}${prefix ? "" : "$"}`, "u");
	const directoryForm = body.endsWith("/**") ? body.slice(0, -3) : void 0;
	const directoryTest = directoryForm === void 0 ? void 0 : new RegExp(`^${escape(directoryForm)}$`, "u");
	return (relative, absolute) => {
		const target = absoluteRule ? absolute : relative;
		if (test.test(target)) return true;
		return directoryTest !== void 0 && directoryTest.test(target);
	};
}
/**
* Parse one `Tool(specifier)` entry. A bare tool name (`Read`) applies to every
* specifier of that tool.
* @param kind - the list the entry came from.
* @param entry - the raw settings entry.
* @returns the parsed rule, or `undefined` when the entry is not a supported form.
*/
function parseRule(kind, entry) {
	const trimmed = entry.trim();
	const open = trimmed.indexOf("(");
	if (open === -1) {
		if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(trimmed)) return void 0;
		return {
			kind,
			tool: trimmed.toLowerCase(),
			specifier: "*"
		};
	}
	if (!trimmed.endsWith(")")) return void 0;
	const tool = trimmed.slice(0, open).trim();
	if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(tool)) return void 0;
	return {
		kind,
		tool: tool.toLowerCase(),
		specifier: trimmed.slice(open + 1, -1).trim()
	};
}
/**
* Select the rules that constrain one tool, most restrictive list first.
* @param rules - every parsed rule.
* @param tool - the tool name to filter by (case-insensitive).
* @returns the tool's rules from `deny`, then `ask`, then `allow`.
*/
function rulesForTool(rules, tool) {
	const wanted = tool.toLowerCase();
	const selected = [];
	for (const kind of RULE_PRECEDENCE) for (const rule of rules) if (rule.kind === kind && rule.tool === wanted) selected.push(rule);
	return selected;
}
/**
* Decide one command line against a tool's rules.
*
* `deny` is existential: one segment matching a deny rule refuses the line, so a
* chained dangerous command cannot ride an allowed prefix. `ask` and `allow`
* are universal: the whole line takes the decision only when every segment
* matches a rule of that kind, so an allowed prefix never authorizes an
* unrelated trailing command.
* @param rules - the tool's rules, ordered by {@link rulesForTool}.
* @param command - the raw command line from the tool arguments.
* @returns the winning kind and, for an allow, whether the bypass is available.
*/
function decideCommand(rules, command) {
	const detailed = splitCommandSegmentsDetailed(command);
	const effective = detailed.filter((segment) => !isInert(segment)).map((segment) => describeSegment(segment.text));
	const segments = effective.length > 0 ? effective : detailed.map((segment) => describeSegment(segment.text));
	if (segments.length === 0) return {
		kind: void 0,
		bypassable: false,
		detail: void 0
	};
	const matches = (kindRules, text) => kindRules.some((rule) => commandMatcher(rule.specifier)(text));
	const describe = (kindRules) => kindRules.map((rule) => `${rule.tool}(${rule.specifier})`).join(", ");
	const denyRules = rules.filter((rule) => rule.kind === "deny");
	if (denyRules.some((rule) => segments.some((segment) => commandMatcher(rule.specifier)(segment.text)))) return {
		kind: "deny",
		bypassable: false,
		detail: `deny rule matched: ${describe(denyRules)}`
	};
	const askRules = rules.filter((rule) => rule.kind === "ask");
	if (askRules.length > 0 && segments.every((segment) => matches(askRules, segment.text))) return {
		kind: "ask",
		bypassable: false,
		detail: `ask rule matched: ${describe(askRules)}`
	};
	const allowRules = rules.filter((rule) => rule.kind === "allow");
	if (allowRules.length > 0 && segments.every((segment) => matches(allowRules, segment.text))) {
		const bypassable = segments.every((segment) => !segment.unsafe);
		const unsafeNote = bypassable ? "" : " (a segment can call a nested shell or interpreter, so it stays sandboxed)";
		return {
			kind: "allow",
			bypassable,
			detail: `allow rule matched: ${describe(allowRules)}${unsafeNote}`
		};
	}
	return {
		kind: void 0,
		bypassable: false,
		detail: void 0
	};
}
//#endregion
export { commandMatcher, decideCommand, describeSegment, parseRule, pathMatcher, rulesForTool, splitCommandSegments, splitCommandSegmentsDetailed };
