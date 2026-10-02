import { parse as parseYaml } from 'yaml'
import type { SourceSpan } from '../../ir/index.js'
import { lineStarts, spanOfLine } from './source.js'

export interface FrontmatterBlock {
  readonly present: boolean
  readonly text: string
  /** 1-based line and character offset where the markdown body begins. */
  readonly bodyLine: number
  readonly bodyOffset: number
}

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(content: string): FrontmatterBlock {
  const match = FRONTMATTER.exec(content)
  if (match === null || match[1] === undefined) {
    return { present: false, text: '', bodyLine: 1, bodyOffset: 0 }
  }
  const consumed = match[0]
  const newlines = consumed.split('\n').length - 1
  return {
    present: true,
    text: match[1],
    bodyLine: newlines + 1,
    bodyOffset: consumed.length,
  }
}

export interface FrontmatterResult {
  readonly data: Record<string, unknown>
  readonly error: string | undefined
}

export function parseFrontmatter(block: FrontmatterBlock): FrontmatterResult {
  if (!block.present) return { data: {}, error: undefined }
  try {
    // maxAliasCount caps alias expansion, which is the YAML denial-of-service vector.
    const value: unknown = parseYaml(block.text, { maxAliasCount: 100 })
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { data: {}, error: 'Frontmatter is not a mapping.' }
    }
    return { data: value as Record<string, unknown>, error: undefined }
  } catch (cause) {
    return { data: {}, error: cause instanceof Error ? cause.message : 'Frontmatter could not be parsed.' }
  }
}

/** Locates a top-level frontmatter key so findings can point at the declaration itself. */
export function frontmatterKeySpan(
  uri: string,
  content: string,
  block: FrontmatterBlock,
  key: string,
): SourceSpan | undefined {
  if (!block.present) return undefined
  const starts = lineStarts(content)
  const lines = block.text.split('\n')
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line !== undefined && pattern.test(line)) {
      return spanOfLine(uri, starts, index + 2, line.replace(/\r$/, '').length)
    }
  }
  return undefined
}

export function readString(data: Record<string, unknown>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return ''
}

export function readStringList(data: Record<string, unknown>, ...keys: readonly string[]): string[] {
  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    }
  }
  return []
}
