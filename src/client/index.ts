/**
 * Browser entry: the settings section and the floating "always allow" action.
 *
 * The action cannot live inside the approval panel: that panel's only child slot
 * is a single cell owned by the host's command display, and the composer dock
 * does not render while an approval takes over the composer. The host reserves
 * `shell.overlay` for exactly this kind of additive surface, so the action
 * mounts there and anchors itself to the panel's own `data-approval-key` element.
 * The host's approval UI is never replaced.
 *
 * The entry depends on no session service: a root-scoped overlay entry cannot
 * rely on per-session state, so the component reads the pending request from the
 * one authoritative DOM signal — the approval card itself.
 *
 * @module @guowenzhang/dsh-permission-whitelist/client
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the configuration-form service merge and slot types.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the slot registry Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the `shell.overlay` frame-wide floating layer declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the Client Gateway's `ctx.remote` service merge.
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import { TYPERT_REMOTE } from './remote.ts'
import { AlwaysAllowPill, type AlwaysAllowFace } from './AlwaysAllowPill.tsx'
import { SettingsSection } from './SettingsSection.tsx'
import { APPROVAL_NS, approvalEn, approvalZh, en, NS, zh, type ApprovalKey, type SectionKey } from './locales.ts'
import { SETTINGS_NS, WhitelistSettingsController, type WhitelistFlags } from './settings-controller.ts'

export type { SettingsSectionProps } from './SettingsSection.tsx'
export type { SectionFace, SectionState } from './settings-controller.ts'

/** Remote namespace the Host service publishes. */
const REMOTE_NAMESPACE = 'permissionWhitelist'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This plugin's settings section copy. */
    'settings.permissionWhitelist': SectionKey
    /** This plugin's floating approval action copy. */
    'approval.permissionWhitelist': ApprovalKey
  }
}

/**
 * Required services: slots, copy, settings forms, and the Remote Gateway.
 *
 * Only `remote` is declared. This half mounts its own namespace, so declaring
 * `remote.permissionWhitelist` here would make the plugin wait for a service it
 * exists to create.
 */
export const inject = ['slots', 'locale', 'configForms', 'remote']

/** Shape of the Host remote as the browser calls it. */
interface WhitelistRemote {
  previewRule(request: { command: string }): Promise<{ ok: true; value: { entry: string | null } } | { ok: false; error: { message: string } }>
  appendAllowRule(request: { command: string }):
  Promise<{ ok: true; value: { entry: string; added: boolean } } | { ok: false; error: { message: string } }>
}

/** Unwrap one remote result, turning a host failure into a thrown error. */
function unwrap<T>(value: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!value.ok) throw new Error(value.error.message)
  return value.value
}

/**
 * Register both surfaces.
 * @param ctx - client root context.
 */
export async function apply(ctx: Context): Promise<void> {
  // Mount this package's Remote contribution before any surface reads it; the
  // Gateway keys namespaces by these descriptors, not by the Host service alone.
  const unmountRemote = await ctx.remote.$mount(TYPERT_REMOTE)
  ctx.effect(() => () => unmountRemote(), 'permission-whitelist: remote mount')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'permission-whitelist: settings copy')
  ctx.effect(() => ctx.locale.register(APPROVAL_NS, { zh: approvalZh, en: approvalEn }), 'permission-whitelist: action copy')
  const t = ctx.locale.bind(NS)

  const controller = new WhitelistSettingsController(ctx.configForms.get<WhitelistFlags>(SETTINGS_NS))
  ctx.effect(() => () => { controller.dispose() }, 'permission-whitelist: settings form')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'permission-whitelist',
    order: 14,
    label: () => t('nav'),
    locale: NS,
    inject: () => controller.inject(),
  }, SettingsSection))

  const requireRemote = (): WhitelistRemote => {
    const service = ctx.get(`remote.${REMOTE_NAMESPACE}`) as WhitelistRemote | undefined
    if (service === undefined) throw new Error('the permission whitelist host service is not mounted')
    return service
  }

  ctx.slots.inject('shell.overlay', () => {
    return ctx.slots.register({
    name: 'shell.overlay',
    id: 'permission-whitelist',
    order: 2,
    locale: APPROVAL_NS,
    inject: (): AlwaysAllowFace => ({
      preview: async text => unwrap(await requireRemote().previewRule({ command: text })).entry,
      commit: async text => unwrap(await requireRemote().appendAllowRule({ command: text })),
    }),
    }, AlwaysAllowPill)
  })
}