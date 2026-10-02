import type { Capability, PathRejection, SourceSpan } from '../../ir/index.js'
import { resolveWithinRoot } from '../../ir/index.js'

export interface ReferenceRecord {
  readonly value: string
  readonly resolved: string | null
  readonly rejection: PathRejection | null
  readonly span: SourceSpan
}

const TOOL_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/
// A separator must be preceded by a real character, so `/slash-command` is not a path.
const PATH_LIKE = /[^/\\][/\\]|\.[a-z0-9]{1,6}$/i
const COMMAND_LIKE = /^[a-z][\w.-]*(?:\.exe)?\s+\S/i
const URL = /\bhttps?:\/\/[^\s<>()"']+/gi
const HASH_MENTION = /(?:^|\s)#([a-z][\w.-]*)/gi

export function toolMentionsIn(text: string, declaredTools: readonly string[]): string[] {
  const found = new Set<string>()
  for (const tool of declaredTools) {
    if (tool.length > 0 && text.includes(tool)) found.add(tool)
  }
  for (const match of text.matchAll(HASH_MENTION)) {
    if (match[1] !== undefined) found.add(match[1])
  }
  return [...found].sort()
}

export function inlineCodeCapability(code: string, declaredTools: readonly string[]): Capability | undefined {
  const value = code.trim()
  if (value.length === 0) return undefined
  if (isPathLike(value)) return undefined
  if (TOOL_TOKEN.test(value)) {
    return { kind: 'tool', value, declared: declaredTools.includes(value) }
  }
  if (COMMAND_LIKE.test(value)) return { kind: 'process', value, declared: false }
  return undefined
}

export function networkCapabilities(text: string): Capability[] {
  const found = new Set<string>()
  for (const match of text.matchAll(URL)) found.add(match[0])
  return [...found].sort().map((value) => ({ kind: 'network', value, declared: false }))
}

export function isPathLike(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (trimmed.includes(' ')) return false
  return PATH_LIKE.test(trimmed)
}

/**
 * Resolution happens here so no later stage ever sees an unvalidated path.
 * A rejected reference is recorded, not dropped - silence would hide the attack.
 */
export function resolveReference(value: string, allowedRoot: string, span: SourceSpan): ReferenceRecord {
  const resolution = resolveWithinRoot(allowedRoot, value)
  if (resolution.ok) return { value, resolved: resolution.path, rejection: null, span }
  return { value, resolved: null, rejection: resolution.reason, span }
}

export function dedupeCapabilities(capabilities: readonly Capability[]): Capability[] {
  const seen = new Map<string, Capability>()
  for (const capability of capabilities) {
    seen.set(`${capability.kind}\u0000${capability.value}`, capability)
  }
  return [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value))
}
