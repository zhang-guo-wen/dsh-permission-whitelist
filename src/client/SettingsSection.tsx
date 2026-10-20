/**
 * Settings section: one row per switch, each with its own save state.
 *
 * Colors come only from `--dsw-alias-*` semantic aliases; copy comes from the
 * typed dictionary. Nothing here is hover-only.
 *
 * @module @guowenzhang/dsh-permission-whitelist/client/SettingsSection
 */

import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SectionFace, SwitchSave } from './settings-controller.ts'
import css from './SettingsSection.module.css'

/** Full component props. */
export type SettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.permissionWhitelist'>
  & InjectFace<SectionFace>

/** One switch row. */
export interface SwitchRow {
  /** Settings field this switch writes. */
  readonly name: 'enabled' | 'logDecisions'
  /** Dictionary key of the label. */
  readonly label: 'bypass.label' | 'rules.logLabel'
  /** Dictionary key of the line: what the switch does in each state. */
  readonly on: 'bypass.on' | 'rules.logOn'
  readonly off: 'bypass.off' | 'rules.logOff'
}

/** The rows, in the order the page presents them. */
export const SWITCH_ROWS: readonly SwitchRow[] = [
  { name: 'enabled', label: 'bypass.label', on: 'bypass.on', off: 'bypass.off' },
  { name: 'logDecisions', label: 'rules.logLabel', on: 'rules.logOn', off: 'rules.logOff' },
]

/** Render the save note beside one switch. */
function saveNote(save: SwitchSave, t: SettingsSectionProps['t']): string | undefined {
  switch (save.phase) {
    case 'saving': return t('bypass.saving')
    case 'saved': return t('bypass.saved')
    case 'failed': return `${t('bypass.failed')}: ${save.message}`
    default: return undefined
  }
}

/**
 * Render the permission allowlist section.
 * @param props - section runtime, locale, and injected face.
 * @returns the settings section body.
 */
export function SettingsSection(props: SettingsSectionProps) {
  const state = props.useWhitelistSettings(snapshot => snapshot)
  const t = props.t
  return (
    <div className={css.root}>
      <h2 className={css.heading}>{t('bypass.title')}</h2>
      <div className={css.rows}>
        {SWITCH_ROWS.map((row) => {
          const checked = state[row.name]
          const save = state.saves[row.name]
          const note = saveNote(save, t)
          return (
            <div key={row.name} className={css.row} data-phase={save.phase}>
              <div className={css.copy}>
                <div className={css.label}>{t(row.label)}</div>
                <div className={css.line}>{t(checked ? row.on : row.off)}</div>
                {note !== undefined && (
                  <div className={css.note} role="status">{note}</div>
                )}
              </div>
              <Switch
                checked={checked}
                label={t(row.label)}
                disabled={!state.writable || save.phase === 'saving'}
                onChange={() => { void props.toggle(row.name) }}
              />
            </div>
          )
        })}
      </div>
      <div className={css.footnote}>
        <div className={css.footnoteTitle}>{t('source.title')}</div>
        <div>{t('source.hint')}</div>
      </div>
    </div>
  )
}