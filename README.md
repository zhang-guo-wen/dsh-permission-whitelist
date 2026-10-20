English | [中文](README.zh.md)

# @guowenzhang/dsh-permission-whitelist

Claude Code permission rules for DeepSeek Harness. Shell and file tool calls
are allowed, sent for approval, or denied from the `permissions` block of a
Claude Code `settings.json` — before the command runs, so an allowlisted command
never fails once and is never retried.

## Why

The sandbox answers "may this call write here"; it does not know that
`pnpm test` is routine for you. The harness's built-in way out is a denial, an
escalation request, and a retry — which costs a round trip and, for a command
that wrote before it was denied, executes part of the command twice. Rules
decide the ordinary case up front and leave the sandbox to handle everything
else.

## Install

```sh
dsh plugin --profile <profile> add @guowenzhang/dsh-permission-whitelist
```

Restart the profile. The plugin contributes its own `cordis.patch.yml` row.

## Configure

Rules live where Claude Code already keeps them, so one file serves both tools:

```json
{
  "permissions": {
    "allow": ["Bash(pnpm test *)", "Bash(git status *)", "Bash(npx tsc *)"],
    "ask":   ["Bash(npm publish *)"],
    "deny":  ["Bash(rm *)", "Bash(git push --force *)"]
  }
}
```

Loaded from `~/.claude/settings.json` (`$CLAUDE_CONFIG_DIR` / `$CLAUDE_HOME`
override it), then `.claude/settings.json` and `.claude/settings.local.json` in
the session workspace. A project file applies only to that workspace; a nested
repository does not inherit its parent's list.

### Rule forms

| Rule | Matches |
|---|---|
| `Bash(pnpm test *)` | `pnpm test`, `pnpm test --run` — a prefix of words |
| `Bash(git status)` | exactly `git status` |
| `Bash(*)` | any command |
| `Read(src/**)`, `Edit(src/**)` | a workspace-relative glob |
| `Read(C:/repo/README.md)` | an absolute path |

`Bash(...)` also governs the Windows `pwsh` tool, because Claude Code has one
shell tool and the harness has one per platform.

### Plugin config

```yaml
- id: permission-whitelist
  config:
    enabled: true        # default
    logDecisions: true
```

`enabled` is the allowlist master switch.

- **On (default)**: a matching `allow` entry answers the call before execution
  **and** runs it outside the file sandbox, so an allowlisted `pnpm install` can
  write a cache outside the workspace. The mode is widened before the call and
  restored when that call settles, so it covers exactly one command. An allow
  that still hit the sandbox wall would fail without ever asking — the one
  outcome the allowlist exists to prevent. `deny` and `ask` entries apply too,
  since they only restrict.
- **Off**: every call falls through to the harness default (sandbox + approval
  prompt), as if this plugin were absent. The settings file is not read.

Both switches are also in **Settings → Permission allowlist**. They are volatile,
so flipping one reaches the running gate without restarting the host.

## Adding commands from the approval card

When a command needs approval, the card shows an **Always allow** button. It
displays the exact entry it will write (`Bash(pnpm test *)`) before you click,
then appends it to `<workspace>/.claude/settings.json`, so the next same-family
call is allowed without asking.

The entry is derived from the command's program and subcommand — never from the
whole command line — so this call's arguments and paths never become permanent
permissions. A command whose program is a shell or interpreter gets no button,
because allowing the interpreter itself would be wider than what you approved.
A settings file that cannot be parsed is refused rather than overwritten, and
the replaced bytes are kept beside it.

## Behavior

- `deny` is checked first and is existential: one segment matching a deny rule
  refuses the whole line, so `git status && rm -rf build` is denied even when
  `git status` is allowed.
- `allow` and `ask` are checked next and are universal: every segment of the
  line must match, so an allowed prefix never covers an unrelated command
  chained after it.
- An unmatched command falls through to the harness default (sandbox + approval
  prompt), unchanged.

## Security properties

- A command line is split on `;`, `&&`, `||`, `|`, and newlines; quoted text
  stays intact.
- Leading `NAME=value` assignments are ignored when selecting the program, so
  `FOO=1 git push` is still `git push`.
- Wrappers (`sudo`, `env`, `time`, `nice`, `nohup`, `command`, …) are skipped
  before matching.
- A segment whose program is a shell or interpreter (`bash`, `pwsh`, `node`,
  `python`, …) or that contains `$`, `(`, `)`, `` ` ``, `>`, `<`, or `#` still
  matches a rule but **never** grants a sandbox bypass: its real effect is not
  visible to a command matcher.
- An unparsable entry is ignored rather than widened, and a malformed settings
  file contributes no rules (the session simply keeps its default behavior).

## Limitations

- A rule can only express "this command line"; pipelines that start with an
  allowed program but do work the rule did not intend (`git status | Out-File
  C:\Windows\x`) stay sandboxed, not allowed.
- MCP tools and `run_code` programs are not covered; they are not shell calls.
- The bypass is opt-in and deployment-wide, not per rule: enable it only if you
  accept that every allowed command runs unconfined.
- `settings.json` is read per call, so edits apply without a restart.

## Development

```sh
npm install
npm run typecheck
npm test        # 25 behavior and host-contract tests against lib/
npm run build
```

`tests/verify-instance.mjs` prints the decision for a set of commands against a
real `.claude/settings.json` and is the quickest way to sanity-check a rule set.

## License

Apache-2.0