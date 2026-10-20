[English](README.md) | 中文

# @guowenzhang/dsh-permission-whitelist

给 DeepSeek Harness 用的 Claude Code 权限规则。shell 与文件工具调用会按 Claude Code
`settings.json` 里的 `permissions` 段，在**命令执行之前**决定放行、询问或拒绝，因此
白名单里的命令不会先失败一次再重试。

## 为什么需要

沙箱只回答“这次调用能不能写这里”，它不知道 `pnpm test` 对你来说是日常操作。harness
内置的出路是：先被拒绝、再申请提权、然后重试——既多一次往返，对“先写了一半才被拒”
的命令还会执行两次。规则负责把常见情况提前决定掉，剩下的仍交给沙箱。

## 安装

```sh
dsh plugin --profile <profile> add @guowenzhang/dsh-permission-whitelist
```

重启该 profile 即可，插件自带 `cordis.patch.yml` 组合行。

## 配置规则

规则就放在 Claude Code 已有的位置，一份文件两边通用：

```json
{
  "permissions": {
    "allow": ["Bash(pnpm test *)", "Bash(git status *)", "Bash(npx tsc *)"],
    "ask":   ["Bash(npm publish *)"],
    "deny":  ["Bash(rm *)", "Bash(git push --force *)"]
  }
}
```

读取顺序：先 `~/.claude/settings.json`（可用 `$CLAUDE_CONFIG_DIR` / `$CLAUDE_HOME`
改写），再是会话工作区里的 `.claude/settings.json` 与 `.claude/settings.local.json`。
项目文件只对该工作区生效，嵌套仓库不会继承上级的名单。

### 规则写法

| 规则 | 匹配 |
|---|---|
| `Bash(pnpm test *)` | `pnpm test`、`pnpm test --run`，按词前缀匹配 |
| `Bash(git status)` | 只匹配 `git status` |
| `Bash(*)` | 任意命令 |
| `Read(src/**)`、`Edit(src/**)` | 工作区相对路径的通配 |
| `Read(C:/repo/README.md)` | 绝对路径 |

`Bash(...)` 同时覆盖 Windows 上的 `pwsh` 工具：Claude Code 只有一个 shell 工具，而
harness 每个平台各有一个。

### 插件配置

```yaml
- id: permission-whitelist
  config:
    enabled: true        # 默认
    logDecisions: true
```

`enabled` 是白名单总开关。

- **开（默认）**：命中 `allow` 的命令在**执行前**就得到放行，并且**脱离文件沙箱**执行，
  因此 `pnpm install` 这类要写工作区外缓存的命令能真正跑完。沙箱模式在调用前放宽、在该调用
  结算时恢复，只覆盖这一条命令。放行却仍被沙箱拦住，等于“不问你就直接失败”，正是白名单要
  消除的结果。`deny` 与 `ask` 在开关打开时同样生效，因为它们只是收紧。
- **关**：所有调用回落到 harness 默认行为（沙箱 + 审批询问），与没装本插件一样，也不再读取
  settings 文件。

两个开关都可以在 **设置 → 权限白名单** 里切换。它们是 volatile 配置，切换后立即对运行中的判定
生效，不需要重启宿主。

## 在审批卡片里添加命令

命令需要审批时，卡片上会多一个 **总是允许** 按钮。点击之前它会显示将要写入的确切条目
（例如 `Bash(pnpm test *)`），点击后把该条目追加到 `<工作区>/.claude/settings.json`，
之后同类命令不再询问。

条目只由命令的程序名与子命令推导，**绝不**包含本次调用的参数与路径，因此一次性参数不会
变成永久权限。程序本身是 shell 或解释器的命令不显示该按钮——放行解释器会比刚批准的那个
动作宽得多。无法解析的 settings 文件会被拒绝写入而不是覆盖，被替换的原字节会保留在文件旁。

## 判定规则

- 先查 `deny`，且是“任一段命中即拒绝”：`git status && rm -rf build` 即使 `git status`
  在白名单里也会被拒绝。
- 再查 `ask` 与 `allow`，要求“每一段都命中”：放行的前缀不会顺带放行后面拼接的其它命令。
- 都不命中则交回 harness 默认行为（沙箱 + 审批询问），不做任何改变。

## 安全性质

- 命令按 `;`、`&&`、`||`、`|` 和换行切段，引号内的内容保持完整。
- 匹配前忽略开头的 `NAME=value` 赋值，`FOO=1 git push` 仍按 `git push` 判定。
- 匹配前跳过包装器（`sudo`、`env`、`time`、`nice`、`nohup`、`command` 等）。
- 若某一段的程序是 shell 或解释器（`bash`、`pwsh`、`node`、`python` 等），或含
  `$`、`(`、`)`、`` ` ``、`>`、`<`、`#`，它仍可命中规则，但**不会**获得沙箱旁路：
  这类段的真实效果对命令匹配器不可见。
- 无法解析的条目会被忽略而不是放宽；settings 文件损坏时按“无规则”处理，会话保持默认行为。

## 已知限制

- 规则只能表达“这条命令行”：以白名单程序开头、却做了规则未预期之事的管道
  （如 `git status | Out-File C:\Windows\x`）会保持沙箱内运行，而不是放行。
- MCP 工具与 `run_code` 程序不在覆盖范围内，它们不是 shell 调用。
- 沙箱旁路是部署级开关而非逐条规则：只有在你能接受“所有放行命令都不受沙箱约束”时才开启。
- `settings.json` 在每次调用时读取，改完无需重启。

## 开发

```sh
npm install
npm run typecheck
npm test        # 25 个行为与宿主契约测试，跑的是 lib/ 产物
npm run build
```

`tests/verify-instance.mjs` 会针对真实的 `.claude/settings.json` 打印一组命令的判定结果，
是核对规则集最快的方式。

## 许可证

Apache-2.0