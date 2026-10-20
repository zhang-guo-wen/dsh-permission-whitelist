/**
 * Verify the browser half's registrations by loading the real handoff bundle.
 *
 * `lib/client.js` is the artifact the desktop host evaluates: it calls
 * `window.__ModuleLoader__.load({ id, factory })` and receives a `require` for
 * its externals. This harness supplies both, then runs the exported `apply`
 * against a fake of the three client services it injects and records every slot
 * registration — answering the question the desktop UI could not: does the code
 * reach the `shell.overlay` registration at all?
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

/** Stub externals: enough surface for the modules to initialise. */
const STUBS = {
  react: {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useEffect: () => {},
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useMemo: (factory) => factory(),
    useRef: (initial) => ({ current: initial }),
  },
  'react/jsx-runtime': {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: 'Fragment',
  },
  '@deepseek-ai/dsh-client-ui-primitives': {
    Button: (props) => ({ type: 'button', props }),
    Switch: (props) => ({ type: 'switch', props }),
  },
  '@deepseek-ai/dsh-client-store': {
    createSnapshotStore: (initial) => ({ get: () => initial, set: () => {}, getSnapshot: () => initial, subscribe: () => () => {} }),
  },
}

/** The CSS-module stand-in the bundle embeds or requires. */
const CSS = new Proxy({}, { get: (_target, key) => String(key) })

/** Load the handoff bundle and return its exported module face. */
function loadBundle() {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let loaded
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: ({ id, factory }) => { loaded = { id, module: factory(requireStub) } },
      },
    },
    document: {
      createElement: () => ({ dataset: {}, set textContent(_value) {}, set innerHTML(_value) {} }),
      head: { appendChild: () => {} },
      querySelector: () => null,
    },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  }
  function requireStub(specifier) {
    if (specifier.endsWith('.css')) return { default: CSS }
    const stub = STUBS[specifier]
    if (stub !== undefined) return stub
    // Unknown externals are tolerated: the harness asserts on registration, not
    // on rendering, so an inert object is enough for module initialisation.
    return new Proxy({}, { get: () => () => ({}) })
  }
  const context = createContext(sandbox)
  runInContext(source, context)
  return loaded
}

/** Minimal client host exposing the services the browser half injects. */
function fakeClientHost() {
  const registrations = []
  const localeNamespaces = []
  const mounted = []
  const ctx = {
    effect: (factory) => {
      const result = typeof factory === 'function' ? factory() : undefined
      return typeof result === 'function' ? result : () => {}
    },
    get: (service) => (service === 'remote.permissionWhitelist'
      ? {
        previewRule: async () => ({ ok: true, value: { entry: 'Bash(pnpm test *)' } }),
        appendAllowRule: async () => ({ ok: true, value: { entry: 'Bash(pnpm test *)', added: true } }),
      }
      : undefined),
    locale: {
      register: (namespace) => { localeNamespaces.push(namespace); return () => {} },
      bind: () => (key, params) => (params === undefined ? key : `${key}:${String(params.entry ?? '')}`),
    },
    configForms: {
      get: () => ({
        getSnapshot: () => ({ status: 'ready', writable: true, value: { enabled: true, logDecisions: true } }),
        subscribe: () => () => {},
        set: async () => {},
      }),
    },
    // The Remote Gateway: `apply` mounts this package's contribution before any
    // surface reads the namespace, so the fake records the mount.
    remote: {
      $mount: async (contribution) => {
        mounted.push(contribution)
        return () => {}
      },
    },
    slots: {
      inject: (_name, register) => { register() },
      register: (options, component) => {
        registrations.push({ name: options.name, id: options.id, component: typeof component })
        return () => {}
      },
    },
  }
  return { ctx, registrations, localeNamespaces, mounted }
}

test('the handoff bundle id is the package name', () => {
  const loaded = loadBundle()
  assert.equal(loaded.id, '@guowenzhang/dsh-permission-whitelist')
})

test('apply registers the settings section and the overlay action', async () => {
  const loaded = loadBundle()
  const host = fakeClientHost()

  await loaded.module.apply(host.ctx)

  assert.deepEqual(host.registrations.map(r => r.name).sort(), ['settings.section', 'shell.overlay'])
  for (const registration of host.registrations) {
    assert.equal(registration.component, 'function', `${registration.name} registers a component`)
  }
})

test('apply registers both locale dictionaries', async () => {
  const loaded = loadBundle()
  const host = fakeClientHost()

  await loaded.module.apply(host.ctx)

  assert.ok(host.localeNamespaces.includes('settings.permissionWhitelist'))
  assert.ok(host.localeNamespaces.includes('approval.permissionWhitelist'))
})

test('apply mounts the Remote contribution before registering surfaces', async () => {
  const loaded = loadBundle()
  const host = fakeClientHost()

  await loaded.module.apply(host.ctx)

  assert.equal(host.mounted.length, 1, 'exactly one contribution is mounted')
  const contribution = host.mounted[0]
  assert.equal(contribution.package, '@guowenzhang/dsh-permission-whitelist')
  const methods = contribution.descriptors.map(descriptor => String(descriptor.method)).sort()
  assert.equal(methods.join(','), 'appendAllowRule,previewRule')
  for (const descriptor of contribution.descriptors) {
    assert.equal(descriptor.namespace, 'permissionWhitelist')
    assert.equal(descriptor.parameters[0].name, 'request')
  }
})
