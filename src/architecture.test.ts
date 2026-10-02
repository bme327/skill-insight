import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(folder: string): string[] {
  const root = path.join(SRC, folder)
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(root)
  return out
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g

function importsOf(file: string): string[] {
  const content = readFileSync(file, 'utf8')
  return [...content.matchAll(IMPORT)].map((match) => match[1] ?? '')
}

// The layer order the whole design depends on: each layer may only import downward.
const LAYERS = [
  { folder: 'ir', forbidden: ['/parsers/', '/validation/', '/assessment/', '/emitters/', '/editor/'] },
  { folder: 'parsers', forbidden: ['/validation/', '/assessment/', '/emitters/', '/editor/'] },
  { folder: 'validation', forbidden: ['/parsers/', '/assessment/', '/emitters/', '/editor/'] },
  { folder: 'assessment', forbidden: ['/parsers/', '/validation/', '/emitters/', '/editor/'] },
  { folder: 'editor', forbidden: ['/app/', '/extension/', '/cli/'] },
]

describe.each(LAYERS)('$folder layer', ({ folder, forbidden }) => {
  it('does not import from a sibling or higher layer', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(folder)) {
      for (const specifier of importsOf(file)) {
        const normalised = specifier.replace(/\\/g, '/')
        if (forbidden.some((segment) => normalised.includes(segment.slice(1)))) {
          offenders.push(`${path.relative(SRC, file)} -> ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  // Core must run unchanged in Node, a browser, and a web worker.
  it('does not reach for a host environment', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(folder)) {
      const content = readFileSync(file, 'utf8')
      if (/from\s*['"](?:node:|vscode)/.test(content)) offenders.push(path.relative(SRC, file))
      if (/\b(?:__dirname|__filename)\b/.test(content)) offenders.push(path.relative(SRC, file))
      if (/\bprocess\.(?:env|cwd|platform)\b/.test(content)) offenders.push(path.relative(SRC, file))
    }
    expect(offenders).toEqual([])
  })

  it('has no deep import into another layer', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(folder)) {
      for (const specifier of importsOf(file)) {
        if (!specifier.startsWith('../')) continue
        const target = specifier.replace(/\\/g, '/')
        const crossesLayer = /^\.\.\/(?:ir|parsers|validation|assessment|emitters|editor)\//.test(target)
        if (crossesLayer && !target.endsWith('/index.js')) {
          offenders.push(`${path.relative(SRC, file)} -> ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('analysis is inert', () => {
  it('never evaluates, requires, spawns, or fetches while parsing', () => {
    const offenders: string[] = []
    for (const folder of ['ir', 'parsers', 'validation', 'assessment']) {
      for (const file of sourceFiles(folder)) {
        const content = readFileSync(file, 'utf8')
        if (/\beval\s*\(|new\s+Function\s*\(|\brequire\s*\(|\bfetch\s*\(|import\s*\(/.test(content)) {
          offenders.push(path.relative(SRC, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
