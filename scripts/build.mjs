import { readFile, rm } from 'node:fs/promises'
import { build } from 'esbuild'

await rm('dist', { force: true, recursive: true })

await Promise.all([
  build({
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.cjs',
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: true,
    target: 'node20',
  }),
  build({
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.browser.cjs',
    bundle: true,
    conditions: ['worker'],
    external: ['vscode'],
    format: 'cjs',
    mainFields: ['module', 'main'],
    platform: 'neutral',
    sourcemap: true,
    target: 'es2022',
  }),
  build({
    entryPoints: ['src/app/webview.tsx'],
    outfile: 'dist/webview/main.js',
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    platform: 'browser',
    sourcemap: true,
    target: 'es2022',
  }),
  build({
    entryPoints: ['src/app/catalog.tsx'],
    outfile: 'dist/webview/catalog.js',
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    platform: 'browser',
    sourcemap: true,
    target: 'es2022',
  }),
])

for (const file of ['dist/extension.cjs', 'dist/extension.browser.cjs']) {
  const bundle = await readFile(file, 'utf8')
  if (bundle.includes('document.createElement')) {
    throw new Error(`${file} contains DOM-only code and cannot run in an extension host`)
  }
}