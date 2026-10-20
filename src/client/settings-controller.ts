/**
 * Controller bridging the Host `permission-whitelist` settings namespace onto
 * the settings section snapshot.
 *
 * A flip is asynchronous, so the section shows 保存中 / 已保存 / 失败 beside the
 * switch that was flipped, and the Host's committed value stays the source of
 * the switch position (a failed write therefore leaves the switch where it was).
 *
 * @module @guowenzhang/dsh-permission-whitelist/client/settings-controller
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Settings namespace: the Loader row id of this plugin. */
export const SETTINGS_NS = 'permission-whitelist'

/** The switches this plugin publishes as settings fields. */
export interface WhitelistFlags {
  enabled: boolean
  logDecisions: boolean
}

/** One switch's write, as the section reports it. */
export type SwitchSave =
  | { readonly phase: 'idle' | 'saving' | 'saved' }
  | { readonly phase: 'failed'; readonly message: string }

/** The resting write state, shared because it carries no per-switch data. */
const IDLE: SwitchSave = { phase: 'idle' }

/** How long a successful write keeps its note before the row goes quiet. */
const SAVED_NOTE_MS = 2_000

/** Snapshot the section renders. */
export interface SectionState {
  /** Whether the namespace is exposed to this client. */
  available: boolean
  /** Whether the Host document accepts writes. */
  writable: boolean
  enabled: boolean
  logDecisions: boolean
  /** Per-switch write state, so one failed write is reported where it happened. */
  saves: Readonly<Record<keyof WhitelistFlags, SwitchSave>>
}

/** Registration-side face for the section. */
export interface SectionFace {
  hooks: {
    /** Section snapshot bound by the renderer as useWhitelistSettings. */
    whitelistSettings: SnapshotStore<SectionState>
  }
  /** Flip one switch and resolve after the Host answered. */
  toggle: (name: keyof WhitelistFlags) => Promise<void>
}

/** Owner handle over the `permission-whitelist` namespace. */
export class WhitelistSettingsController {
  private readonly store: SnapshotStore<SectionState>
  private readonly unsubscribe: () => void
  private readonly saves = new Map<keyof WhitelistFlags, SwitchSave>()
  private readonly saveTimers = new Map<keyof WhitelistFlags, ReturnType<typeof setTimeout>>()

  /**
   * @param scope - the `permission-whitelist` configuration form.
   */
  constructor(private readonly scope: ConfigForm<WhitelistFlags>) {
    this.store = createSnapshotStore(this.projection())
    this.unsubscribe = scope.subscribe(() => this.publish())
  }

  /** Stop observing settings and drop pending note timers. */
  dispose(): void {
    this.unsubscribe()
    for (const timer of this.saveTimers.values()) clearTimeout(timer)
    this.saveTimers.clear()
  }

  /** Build the renderer face for this section. */
  inject(): SectionFace {
    return {
      hooks: { whitelistSettings: this.store },
      toggle: name => this.toggle(name),
    }
  }

  private async toggle(name: keyof WhitelistFlags): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status !== 'ready' || !snapshot.writable) return
    const value = snapshot.value?.[name]
    if (value === undefined) return
    this.setSave(name, { phase: 'saving' })
    try {
      await this.scope.set(name, !value)
    } catch (error) {
      this.setSave(name, { phase: 'failed', message: error instanceof Error ? error.message : String(error) })
      return
    }
    this.setSave(name, { phase: 'saved' })
    this.scheduleNoteClear(name)
  }

  private setSave(name: keyof WhitelistFlags, save: SwitchSave): void {
    this.saves.set(name, save)
    this.publish()
  }

  private scheduleNoteClear(name: keyof WhitelistFlags): void {
    const previous = this.saveTimers.get(name)
    if (previous !== undefined) clearTimeout(previous)
    this.saveTimers.set(name, setTimeout(() => {
      this.saveTimers.delete(name)
      if (this.saves.get(name)?.phase === 'saved') this.setSave(name, IDLE)
    }, SAVED_NOTE_MS))
  }

  private projection(): SectionState {
    const snapshot = this.scope.getSnapshot()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      enabled: snapshot.value?.enabled ?? true,
      logDecisions: snapshot.value?.logDecisions ?? true,
      saves: {
        enabled: this.saves.get('enabled') ?? IDLE,
        logDecisions: this.saves.get('logDecisions') ?? IDLE,
      },
    }
  }

  private publish(): void {
    this.store.set(this.projection())
  }
}