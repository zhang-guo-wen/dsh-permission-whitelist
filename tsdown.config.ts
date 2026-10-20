import { defineConfig } from 'tsdown'
import ts from 'typescript'

const DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m

/**
 * Lower TC39 stage-3 class decorators before rolldown bundles the host entry.
 * Node does not parse decorator syntax, so the `@Remote` markers on the
 * whitelist authoring service must be compiled to their `__runInitializers`
 * form at build time.
 */
function lowerDecorators() {
  return {
    name: 'dsh-lower-decorators',
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0] ?? id
      if (!/\.[cm]?tsx?$/.test(file) || !DECORATOR_SYNTAX.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

export default defineConfig({
  entry: ['src/index.ts', 'src/rules.ts', 'src/settings.ts', 'src/writer.ts'],
  format: ['esm'],
  outDir: 'lib',
  platform: 'node',
  dts: false,
  // Harness services resolve from the host at runtime, exactly like the other
  // @guowenzhang plugins: never bundle them.
  deps: { neverBundle: [/^@deepseek-ai\//] },
  plugins: [lowerDecorators()],
  // `clean` would delete lib/client.js, which build-client.mjs writes: the two
  // artifacts share one output directory and are built in sequence.
  clean: false,
})