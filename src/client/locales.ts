/**
 * Copy for this plugin's settings section.
 *
 * Every product-visible string lives here. `en` is typed against the Chinese
 * dictionary, so a new entry cannot ship untranslated.
 *
 * @module @guowenzhang/dsh-permission-whitelist/client/locales
 */

/** Locale namespace owned by this plugin's settings section. */
export const NS = 'settings.permissionWhitelist'

/** Settings-section keys. */
const zh = {
  'nav': '权限白名单',
  'bypass.title': '命令白名单',
  'bypass.on': '白名单命中的命令不再询问，并直接在工作区外执行（不受文件沙箱限制）',
  'bypass.off': '白名单不生效：所有命令仍走沙箱与审批，与未安装本插件时相同',
  'bypass.label': '启用命令白名单',
  'bypass.saving': '保存中',
  'bypass.saved': '已保存',
  'bypass.failed': '保存失败',
  'source.title': '添加与查看规则',
  'source.hint': '在输入框使用 /allow <命令>（加 --user 写入用户级配置）；不带参数则列出当前规则。审批出现时，卡片右侧也会浮出「总是允许」按钮。',
  'rules.logLabel': '记录判定',
  'rules.logOn': '每条命令的放行、询问与拒绝都写进宿主日志，便于调整规则',
  'rules.logOff': '不再记录判定结果',
}

/** Settings-section key union. */
export type SectionKey = keyof typeof zh

/** English dictionary, complete against {@link SectionKey}. */
export const en: Record<SectionKey, string> = {
  'nav': 'Permission allowlist',
  'bypass.title': 'Command allowlist',
  'bypass.on': 'Allowlisted commands stop asking and run outside the workspace, without the file sandbox.',
  'bypass.off': 'The allowlist is off: every command uses the sandbox and the approval prompt, as if this plugin were absent.',
  'bypass.label': 'Enable the command allowlist',
  'bypass.saving': 'Saving',
  'bypass.saved': 'Saved',
  'bypass.failed': 'Save failed',
  'source.title': 'Add and inspect rules',
  'source.hint': 'Use /allow <command> in the composer (add --user for the user settings file); with no argument it lists the current rules. While an approval is pending, an Always allow button floats beside its card.',
  'rules.logLabel': 'Log decisions',
  'rules.logOn': 'Write each allow, ask, and deny decision to the host log while tuning rules',
  'rules.logOff': 'Stop recording decisions',
}

export { zh }

/** Locale namespace for the floating approval action. */
export const APPROVAL_NS = 'approval.permissionWhitelist'

/** Floating approval action copy. */
export const approvalZh = {
  'alwaysAllow': '总是允许',
  'copied': '已复制，粘贴到输入框执行',
  'ruleHint': '将添加规则：{entry}',
  'saved': '已加入白名单并允许本次',
  'savedOnly': '已加入白名单：{entry}，请手动点「允许一次」完成本次',
  'failed': '操作失败：{message}',
}

/** Floating approval action key union. */
export type ApprovalKey = keyof typeof approvalZh

/** English floating-approval copy, complete against {@link ApprovalKey}. */
export const approvalEn: Record<ApprovalKey, string> = {
  'alwaysAllow': 'Always allow',
  'copied': 'Copied — paste it into the composer',
  'ruleHint': 'Rule to add: {entry}',
  'saved': 'Added to the allowlist and allowed this call',
  'savedOnly': 'Added to the allowlist: {entry} — approve this call manually',
  'failed': 'Could not complete: {message}',
}