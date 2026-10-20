/**
 * Claude Code permission-rule vocabulary: parsing `Tool(specifier)` entries and
 * deciding whether one command line satisfies them.
 *
 * Two hazards shape the algorithm. First, an allowlist that matches a raw
 * command string is bypassed by anything the shell executes alongside it, so a
 * command line is split into every segment its shell would run and the entry
 * must match each one. Second, a segment can be written so that its leading
 * words no longer name the program that runs — an assignment, a wrapper such as
 * `env` or `sudo`, or a nested interpreter call — so leading assignments are
 * dropped and shell segments whose first word is a known shell or interpreter
 * are not eligible for an allow that bypasses the sandbox.
 *
 * @module @guowenzhang/dsh-permission-whitelist/rules
 */

/** Which configured list a rule came from; stricter kinds win when both match. */
export type RuleKind = 'deny' | 'ask' | 'allow'

/** One parsed `Tool(specifier)` entry. */
export interface PermissionRule {
  /** The list this rule belongs to. */
  readonly kind: RuleKind
  /** Tool name the rule constrains, lowercased (`bash`, `pwsh`, `read`, …). */
  readonly tool: string
  /** Content specifier: a command form for shell tools, a path glob otherwise. */
  readonly specifier: string
}

/** Rules in precedence order: deny beats ask beats allow. */
const RULE_PRECEDENCE: readonly RuleKind[] = ['deny', 'ask', 'allow']

/** Shell or interpreter programs whose arguments are themselves executable. */
const NESTED_EXECUTION_PROGRAMS: ReadonlySet<string> = new Set([
  'bash', 'sh', 'zsh', 'fish', 'dash', 'ksh', 'pwsh', 'powershell', 'cmd', 'cmd.exe',
  'node', 'deno', 'bun', 'python', 'python3', 'py', 'ruby', 'perl', 'php', 'Rscript',
  'eval', 'exec', 'invoke-expression', 'iex', 'invoke-command', 'start-process',
])

/**
 * Wrappers that run the rest of the segment as a program. Their argv prefixes
 * are skipped before the program word is compared, so `env FOO=1 pnpm test`
 * matches a `Bash(pnpm test)` rule.
 */
const PROGRAM_WRAPPERS: ReadonlySet<string> = new Set([
  'env', 'sudo', 'doas', 'time', 'nice', 'nohup', 'command', 'builtin', 'exec', 'gtimeout', 'timeout',
])

/** Argument shapes that make a wrapper consume flags before the program word. */
const WRAPPER_FLAG_PREFIXES: ReadonlySet<string> = new Set(['sudo', 'time', 'nice', 'timeout', 'gtimeout'])

/** Quote characters a shell honors inside a command line. */
const QUOTE_CHARACTERS: ReadonlySet<string> = new Set(['"', "'", '`'])

/**
 * Characters that start or contain a shell construct whose effect the rule
 * vocabulary cannot describe (substitution, chaining, redirection, a comment).
 * A segment containing one is never eligible for an allow.
 */
const UNREPRESENTABLE_CONSTRUCTS: ReadonlySet<string> = new Set(['$', '(', ')', '`', '>', '<', '#'])

/** One executable segment recovered from a command line. */
export interface CommandSegment {
  /** The segment text with leading assignments removed and whitespace trimmed. */
  readonly text: string
  /** Whether the segment can only pass the rule matcher; it never authorizes a sandbox bypass. */
  readonly unsafe: boolean
}

/**
 * Split a command line into the segments a shell would execute, keeping quoted
 * text intact. The separators are `;`, `&&`, `||`, `|` and newlines.
 * @param command - the raw command text from the tool arguments.
 * @returns every non-empty segment in source order.
 */
export function splitCommandSegments(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let quote: string | undefined
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] as string
    if (quote !== undefined) {
      current += character
      if (character === quote) quote = undefined
      continue
    }
    if (QUOTE_CHARACTERS.has(character)) {
      quote = character
      current += character
      continue
    }
    if (character === '\n' || character === ';') {
      segments.push(current)
      current = ''
      continue
    }
    if (character === '&' || character === '|') {
      // `&&` and `||` are one separator; a single `&` backgrounds the segment.
      const next = command[index + 1]
      segments.push(current)
      current = ''
      if (next === character) index += 1
      continue
    }
    current += character
  }
  segments.push(current)
  return segments.map(segment => segment.trim()).filter(segment => segment.length > 0)
}

/**
 * One command segment plus the separator that introduced it.
 *
 * A `|` target and a bare literal have no effect of their own, so a rule only
 * has to cover the commands that actually do something. Keeping the separator
 * is what lets that distinction survive the split.
 */
export interface DetailedSegment {
  /** Segment text, trimmed. */
  readonly text: string
  /** Separator before this segment; `undefined` for the first one. */
  readonly separator: ';' | '|' | '&&' | '||' | '&' | '\n' | undefined
}

/**
 * Split a command line like {@link splitCommandSegments} while keeping the
 * separator that introduced each segment.
 * @param command - the raw command text from the tool arguments.
 * @returns every non-empty segment with its separator, in source order.
 */
export function splitCommandSegmentsDetailed(command: string): DetailedSegment[] {
  const segments: DetailedSegment[] = []
  let current = ''
  let separator: DetailedSegment['separator']
  let quote: string | undefined
  const flush = (next: DetailedSegment['separator']): void => {
    const text = current.trim()
    if (text.length > 0) segments.push({ text, separator })
    current = ''
    separator = next
  }
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] as string
    if (quote !== undefined) {
      current += character
      if (character === quote) quote = undefined
      continue
    }
    if (QUOTE_CHARACTERS.has(character)) {
      quote = character
      current += character
      continue
    }
    if (character === '\n') {
      flush('\n')
      continue
    }
    if (character === ';') {
      flush(';')
      continue
    }
    if (character === '&' || character === '|') {
      const next = command[index + 1]
      if (next === character) {
        flush(character === '&' ? '&&' : '||')
        index += 1
      } else {
        flush(character)
      }
      continue
    }
    current += character
  }
  const tail = current.trim()
  if (tail.length > 0) segments.push({ text: tail, separator })
  return segments
}

/**
 * Pipe targets that cannot change anything by themselves.
 *
 * These only reformat or discard what the previous command produced, so they do
 * not need their own rule. Script-block cmdlets (`Where-Object`,
 * `ForEach-Object`) are deliberately absent: they run arbitrary code.
 */
const HARMLESS_PIPE_TARGETS: ReadonlySet<string> = new Set([
  'out-null', 'write-output', 'write-host', 'format-table', 'format-list',
  'measure-object', 'sort-object', 'select-object', 'convertto-json', 'select-string',
])

/** A bare quoted string or number only prints a value. */
const BARE_LITERAL = /^(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)$/u

/**
 * Decide whether a segment needs a rule of its own.
 * @param segment - one detailed segment.
 * @returns whether the segment has no effect that a rule must cover.
 */
function isInert(segment: DetailedSegment): boolean {
  const words = segment.text.split(/\s+/u).filter(word => word.length > 0)
  const head = words[0]
  if (head === undefined) return true
  if (BARE_LITERAL.test(head)) return true
  if (segment.separator !== '|') return false
  const program = head.replace(/^["']|["']$/gu, '').toLowerCase()
  return HARMLESS_PIPE_TARGETS.has(program)
}

/**
 * Remove leading `NAME=value` assignments, because the shell applies them to the
 * following program rather than running them, and `FOO=1 git push` would
 * otherwise dodge a `Bash(git push:*)` rule.
 * @param segment - one segment from {@link splitCommandSegments}.
 * @returns the segment beginning at its first word.
 */
function stripLeadingAssignments(segment: string): string {
  let rest = segment.trimStart()
  for (;;) {
    const match = /^[A-Za-z_][A-Za-z0-9_]*=/u.exec(rest)
    if (match === null) return rest
    // Skip the assignment word, honoring one quoted value.
    const afterName = rest.slice(match[0].length)
    let consumed = 0
    let quote: string | undefined
    for (; consumed < afterName.length; consumed += 1) {
      const character = afterName[consumed] as string
      if (quote !== undefined) {
        if (character === quote) quote = undefined
        continue
      }
      if (QUOTE_CHARACTERS.has(character)) {
        quote = character
        continue
      }
      if (/\s/u.test(character)) break
    }
    rest = afterName.slice(consumed).trimStart()
  }
}

/**
 * Resolve the program a segment runs after skipping wrapper prefixes.
 * @param words - the segment's whitespace-separated words.
 * @returns the program word, lowercased, and the index it occupies.
 */
function programWord(words: readonly string[]): { word: string; index: number } | undefined {
  let index = 0
  for (;;) {
    const raw = words[index]
    if (raw === undefined) return undefined
    const word = raw.replace(/^["']|["']$/gu, '').toLowerCase()
    if (!PROGRAM_WRAPPERS.has(word)) return { word, index }
    index += 1
    if (WRAPPER_FLAG_PREFIXES.has(word)) {
      // Skip the wrapper's own flags and their values so `sudo -E pnpm` still
      // compares `pnpm` rather than `-E`.
      while (index < words.length) {
        const flag = words[index] as string
        if (!flag.startsWith('-')) break
        index += flag === '-u' || flag === '--user' ? 2 : 1
      }
    }
    // `env NAME=value` assignments precede the program word.
    while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index] as string)) index += 1
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
export function describeSegment(segment: string): CommandSegment {
  const stripped = stripLeadingAssignments(segment)
  const words = stripped.split(/\s+/u).filter(word => word.length > 0)
  const program = programWord(words)
  const text = program === undefined ? stripped : words.slice(program.index).join(' ')
  const nested = program !== undefined && NESTED_EXECUTION_PROGRAMS.has(program.word)
  const unrepresentable = [...text].some(character => UNREPRESENTABLE_CONSTRUCTS.has(character))
  return { text, unsafe: nested || unrepresentable }
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
export function commandMatcher(specifier: string): (segment: string) => boolean {
  const wanted = specifier.trim()
  if (wanted === '*' || wanted === '') return () => true
  const prefix = /^[^*]*\*$/u.test(wanted) || /\s\*$/u.test(wanted)
  const body = prefix ? wanted.slice(0, -1).trimEnd() : wanted
  const targetWords = body.split(/\s+/u).filter(word => word.length > 0)
  return (segment) => {
    const words = segment.split(/\s+/u).filter(word => word.length > 0)
    if (!prefix && targetWords.length !== words.length) return false
    if (prefix && words.length < targetWords.length) return false
    return targetWords.every((target, index) => matchWord(target, words[index] as string))
  }
}

/**
 * Compare one specifier word with one segment word.
 * @param target - the specifier word, possibly containing `*`.
 * @param actual - the segment word.
 * @returns whether they match, case-sensitively except on Windows-style paths.
 */
function matchWord(target: string, actual: string): boolean {
  if (!target.includes('*')) return target === actual
  const pattern = target
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*')
  return new RegExp(`^${pattern}$`, 'u').test(actual)
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
export function pathMatcher(specifier: string): (relative: string, absolute: string) => boolean {
  const normalized = specifier.trim().replace(/\\/gu, '/').replace(/\/{2,}/gu, '/')
  // A drive-letter path (`C:/…`) is absolute too; Windows sessions always
  // spell paths that way, and treating it as a relative glob would compare it
  // against the wrong string.
  const absoluteRule = normalized.startsWith('/') || normalized.startsWith('~/') || /^[A-Za-z]:\//u.test(normalized)
  const prefix = normalized.endsWith('*') && !normalized.slice(0, -1).includes('*')
  const body = prefix ? normalized.slice(0, -1) : normalized
  // `$` must be escaped too: it is the end anchor, so an unescaped one inside a
  // path would silently turn `^pattern$` into a false condition.
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = body
    .split('**')
    .map(part => escape(part).split('*').join('[^/]*'))
    .join('.*')
  const test = new RegExp(`^${pattern}${prefix ? '' : '$'}`, 'u')
  // `src/**` also covers `src` itself: a directory rule means "everything under
  // here", and a tool that reports the directory (grep, glob) must match it.
  const directoryForm = body.endsWith('/**') ? body.slice(0, -3) : undefined
  const directoryTest = directoryForm === undefined
    ? undefined
    : new RegExp(`^${escape(directoryForm)}$`, 'u')
  return (relative, absolute) => {
    const target = absoluteRule ? absolute : relative
    if (test.test(target)) return true
    return directoryTest !== undefined && directoryTest.test(target)
  }
}

/**
 * Parse one `Tool(specifier)` entry. A bare tool name (`Read`) applies to every
 * specifier of that tool.
 * @param kind - the list the entry came from.
 * @param entry - the raw settings entry.
 * @returns the parsed rule, or `undefined` when the entry is not a supported form.
 */
export function parseRule(kind: RuleKind, entry: string): PermissionRule | undefined {
  const trimmed = entry.trim()
  const open = trimmed.indexOf('(')
  if (open === -1) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(trimmed)) return undefined
    return { kind, tool: trimmed.toLowerCase(), specifier: '*' }
  }
  if (!trimmed.endsWith(')')) return undefined
  const tool = trimmed.slice(0, open).trim()
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(tool)) return undefined
  return { kind, tool: tool.toLowerCase(), specifier: trimmed.slice(open + 1, -1).trim() }
}

/**
 * Select the rules that constrain one tool, most restrictive list first.
 * @param rules - every parsed rule.
 * @param tool - the tool name to filter by (case-insensitive).
 * @returns the tool's rules from `deny`, then `ask`, then `allow`.
 */
export function rulesForTool(rules: readonly PermissionRule[], tool: string): PermissionRule[] {
  const wanted = tool.toLowerCase()
  const selected: PermissionRule[] = []
  for (const kind of RULE_PRECEDENCE) {
    for (const rule of rules) {
      if (rule.kind === kind && rule.tool === wanted) selected.push(rule)
    }
  }
  return selected
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
export function decideCommand(rules: readonly PermissionRule[], command: string): {
  kind: RuleKind | undefined
  /** Every segment matched the allow rule AND no segment is ineligible for a bypass. */
  bypassable: boolean
  /** Reason text describing why a rule won, for audit and model-facing messages. */
  detail: string | undefined
} {
  const detailed = splitCommandSegmentsDetailed(command)
  const effective = detailed.filter(segment => !isInert(segment)).map(segment => describeSegment(segment.text))
  // An inert line (`out-null`, `'ok'`) still has to be described, or an empty
  // allow list would read as "nothing to permit" instead of "nothing to do".
  const segments = effective.length > 0 ? effective : detailed.map(segment => describeSegment(segment.text))
  if (segments.length === 0) return { kind: undefined, bypassable: false, detail: undefined }
  const matches = (kindRules: readonly PermissionRule[], text: string): boolean =>
    kindRules.some(rule => commandMatcher(rule.specifier)(text))
  const describe = (kindRules: readonly PermissionRule[]): string =>
    kindRules.map(rule => `${rule.tool}(${rule.specifier})`).join(', ')

  const denyRules = rules.filter(rule => rule.kind === 'deny')
  if (denyRules.some(rule => segments.some(segment => commandMatcher(rule.specifier)(segment.text)))) {
    return { kind: 'deny', bypassable: false, detail: `deny rule matched: ${describe(denyRules)}` }
  }
  const askRules = rules.filter(rule => rule.kind === 'ask')
  if (askRules.length > 0 && segments.every(segment => matches(askRules, segment.text))) {
    return { kind: 'ask', bypassable: false, detail: `ask rule matched: ${describe(askRules)}` }
  }
  const allowRules = rules.filter(rule => rule.kind === 'allow')
  if (allowRules.length > 0 && segments.every(segment => matches(allowRules, segment.text))) {
    const bypassable = segments.every(segment => !segment.unsafe)
    const unsafeNote = bypassable ? '' : ' (a segment can call a nested shell or interpreter, so it stays sandboxed)'
    return { kind: 'allow', bypassable, detail: `allow rule matched: ${describe(allowRules)}${unsafeNote}` }
  }
  return { kind: undefined, bypassable: false, detail: undefined }
}