/**
 * Test-only entry: re-exports the floating action with the host UI primitives
 * replaced by inert stand-ins.
 *
 * The real `@deepseek-ai/dsh-client-ui-primitives` package is a browser bundle
 * the host injects at runtime; it is not installed in this repository, so a
 * jsdom render cannot import it. The stand-in preserves the element the test
 * asserts on (a native `button`) without the styling machinery.
 *
 * @module @guowenzhang/dsh-permission-whitelist/client/pill-test-entry
 */

export { AlwaysAllowPill } from './AlwaysAllowPill.tsx'
export type { AlwaysAllowFace, AlwaysAllowPillProps } from './AlwaysAllowPill.tsx'