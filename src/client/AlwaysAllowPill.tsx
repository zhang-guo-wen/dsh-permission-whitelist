/**
 * Floating "always allow" action for the pending approval.
 *
 * The approval panel owns its only child slot as a single cell and the composer
 * dock does not render while an approval takes over the composer, so there is no
 * extension point inside the panel. This entry mounts into `shell.overlay` — the
 * frame-wide, click-through floating layer the host reserves for additive
 * surfaces — and anchors itself to the panel's own `data-approval-key` element,
 * above the card's top-left corner. Nothing in the host's approval UI is
 * replaced or registered over.
 *
 * The pill names the command it applies to, truncated when long, so the action
 * is never ambiguous about which call it covers.
 *
 * @module @guowenzhang/dsh-permission-whitelist/client/AlwaysAllowPill
 */

import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AlwaysAllowPill.module.css'

/** Injectable face for the floating action. */
export interface AlwaysAllowFace {
  /** Derive the settings entry for a command without writing. */
  preview: (command: string) => Promise<string | null>
  /** Append the derived entry; the Host uses the user settings file when no path is given. */
  commit: (command: string) => Promise<{ entry: string; added: boolean }>
}

/** Full component props. */
export type AlwaysAllowPillProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'approval.permissionWhitelist'>
  & InjectFace<AlwaysAllowFace>

/** Space between the card's bottom edge and the pill, in pixels. */
const GAP_PX = 8

/** Button height used for vertical alignment against the card's action row. */
const BUTTON_HEIGHT_PX = 36

/** How often the anchor is re-measured, in milliseconds. */
const POLL_MS = 250

/** The approval panel's own root, used as the anchor. */
const CARD_SELECTOR = '[data-approval-key]'

/** The scroll container that carries the card's command detail. */
const BODY_SELECTOR = '[data-approval-scroll]'

/** Box and command of the approval card, in viewport coordinates. */
interface CardState {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly command: string
  /** The card's own action row, so the action can join that line. */
  readonly row: { readonly top: number; readonly left: number; readonly height: number } | undefined
}

/**
 * Read the command the approval is about.
 *
 * The panel renders the correlated shell command in its own element, whose class
 * keeps the semantic `command` prefix across the CSS-module hash. When no such
 * element exists the card's text is the best available answer.
 * @param card - the approval panel's root element.
 * @returns the command line, possibly empty.
 */
function commandOf(card: Element): string {
  const body = card.querySelector(BODY_SELECTOR) ?? card
  const node = body.querySelector('[class*="command"]')
  const text = (node?.textContent ?? '').trim()
  if (text.length > 0) return text
  return (card.textContent ?? '').trim()
}

/**
 * Measure the approval card.
 * @returns its box and command, or undefined when no approval is on screen.
 */
function readCard(): CardState | undefined {
  const card = document.querySelector(CARD_SELECTOR)
  if (card === null) return undefined
  const box = card.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return undefined
  return { top: box.top, bottom: box.bottom, left: box.left, command: commandOf(card), row: rowOf(card) }
}

/**
 * Measure the card's action row — the line holding its own buttons.
 *
 * Joining that row puts this action where a user already looks for one, instead
 * of floating beside the card. The class keeps its semantic `actionRow` prefix
 * across the CSS-module hash.
 * @param card - the approval panel's root element.
 * @returns the row's box, or undefined when the panel renders none.
 */
function rowOf(card: Element): CardState['row'] {
  const row = card.querySelector('[class*="actionRow"]')
  if (row === null) return undefined
  // Anchor on the row's first control, not the row box: the row spans the whole
  // card, so aligning to its left edge would push this action off-screen.
  const first = row.querySelector('button')
  const target = first ?? row
  const box = target.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return undefined
  return { top: box.top, left: box.left, height: box.height }
}

/**
 * Answer the waiting approval the way the host's own "allow once" does.
 *
 * The Remote protocol carries no handle to the pending request, so the action
 * answers through the panel's own control: clicking it is exactly what a user
 * would do, and it settles the call instead of leaving the panel waiting after a
 * rule was already written.
 * @returns whether a control was found and clicked.
 */
function dismissApproval(): boolean {
  const card = document.querySelector(CARD_SELECTOR)
  if (card === null) return false
  const buttons = [...card.querySelectorAll('button')]
  // The allow control is the last action; the label match just keeps this from
  // depending on button order alone.
  const allow = buttons.find(button => /允许一次|allow once/iu.test(button.textContent ?? ''))
    ?? buttons.at(-1)
  if (allow === undefined) return false
  allow.click()
  return true
}

/**
 * Render the floating action below the pending approval's card.
 * @param props - locale and the injected face.
 * @returns the positioned pill, or null when no approval is on screen.
 */
export function AlwaysAllowPill(props: AlwaysAllowPillProps) {
  const t = props.t
  const [card, setCard] = useState<CardState | undefined>(undefined)
  /**
   * The rule this click would add: `undefined` while it is being derived, `null`
   * when the card's text is not a command (an escalation reason, for instance).
   * The action only appears once a real rule exists, so a click can never fail
   * with "cannot be reduced to a rule".
   */
  const [entry, setEntry] = useState<string | null | undefined>(undefined)
  const [message, setMessage] = useState<string | undefined>(undefined)

  // Poll the anchor: the panel mounts and unmounts per request, and the layout
  // shifts as the transcript grows, so a one-shot measure would miss it.
  useEffect(() => {
    const tick = (): void => { setCard(readCard()) }
    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => { clearInterval(timer) }
  }, [])

  // Describe the rule a rule-write would add; shown on the button, so the user
  // knows the width of what they are approving before clicking.
  useEffect(() => {
    let active = true
    if (card === undefined || card.command.length === 0) {
      setEntry(null)
      return () => { active = false }
    }
    void props.preview(card.command).then(
      (value) => { if (active) setEntry(value) },
      () => { if (active) setEntry(null) },
    )
    return () => { active = false }
  }, [card?.command, props])

  if (card === undefined) return null
  // Nothing usable means nothing to offer: the card's text is a reason rather
  // than a command, so there is no rule to record.
  if (entry === undefined || entry === null) return null

  const click = async (): Promise<void> => {
    setMessage(undefined)
    try {
      const result = await props.commit(card.command)
      setEntry(result.entry)
      // Answer the waiting request too: a rule was just recorded, so leaving the
      // panel open would ask the user to approve the same call twice.
      if (!dismissApproval()) setMessage(t('savedOnly', { entry: result.entry }))    } catch (error) {
      setMessage(t('failed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }

  // Join the card's action row when it has one, so the action reads as a third
  // button on that line. Without a row it falls back to just under the card.
  const style = card.row === undefined
    ? { top: `${card.bottom + GAP_PX}px`, left: `${card.left}px` }
    : {
        top: `${card.row.top + (card.row.height - BUTTON_HEIGHT_PX) / 2}px`,
        // Right-align the pill against the row's left edge: the row starts with
        // the reject control, and `translateX(-100%)` places this just before it.
        left: `${card.row.left - GAP_PX}px`,
        transform: 'translateX(-100%)',
      }

  return (
    <div className={css.root} style={style}>
      <Button
        variant="outline"
        title={entry === null ? undefined : t('ruleHint', { entry })}
        onClick={() => { void click() }}
      >
        {t('alwaysAllow')}
      </Button>
      {card.command.length > 0 && (
        <span className={css.command} title={card.command}>{card.command}</span>
      )}
      {message !== undefined && (
        <span className={css.note} role="status">{message}</span>
      )}
    </div>
  )
}
