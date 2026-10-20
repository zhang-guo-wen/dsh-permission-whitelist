/**
 * Client-side declaration of this plugin's Remote methods.
 *
 * A generated Typert contribution would produce exactly this shape; the package
 * ships the description by hand instead so the browser can mount the namespace
 * without a build-time generator. Each entry must name the Host method, its
 * namespace, and the one `request` parameter the Host methods declare, because
 * the Gateway matches calls by that wire identity.
 *
 * @module @guowenzhang/dsh-permission-whitelist/client/remote
 */

/** Cordis service key and wire namespace, matching the Host service. */
export const REMOTE_NAMESPACE = 'permissionWhitelist'

/** Methods the Host service publishes. */
const METHODS = ['previewRule', 'appendAllowRule'] as const

/** Pass-through codec: these payloads are validated by their own Host methods. */
interface WireCodec {
  readonly mode: 'strict'
  readonly typeSymbol: string
  readonly schema: { parse: (value: unknown) => unknown }
  readonly create: () => { parse: (value: unknown) => unknown }
}

/**
 * Build a pass-through codec for one wire position.
 * @param typeSymbol - the identity recorded in the descriptor.
 * @returns the codec the Gateway expects.
 */
function codec(typeSymbol: string): WireCodec {
  const schema = { parse: (value: unknown): unknown => value }
  return { mode: 'strict', typeSymbol, schema, create: () => schema }
}

/** One method descriptor as the Client Gateway consumes it. */
interface WireDescriptor {
  readonly id: string
  readonly service: string
  readonly namespace: string
  readonly method: string
  readonly invocation: { readonly kind: 'direct' }
  readonly parameters: readonly {
    readonly name: string
    readonly wire: string
    readonly source: 'json'
    readonly codec: WireCodec
  }[]
  readonly result: WireCodec
}

/**
 * Describe one Remote method.
 * @param method - the Host method name.
 * @returns its descriptor.
 */
function descriptor(method: string): WireDescriptor {
  const owner = `@guowenzhang/dsh-permission-whitelist#${REMOTE_NAMESPACE}/${method}`
  return {
    id: owner,
    service: REMOTE_NAMESPACE,
    namespace: REMOTE_NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: codec(`${owner}:request`) }],
    result: codec(`${owner}:result`),
  }
}

/** The complete contribution `ctx.remote.$mount` registers. */
export const TYPERT_REMOTE = {
  package: '@guowenzhang/dsh-permission-whitelist',
  descriptors: METHODS.map(descriptor),
}