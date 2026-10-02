import type { NodeKind } from '../../ir/index.js'

export type StatementKind = Extract<
  NodeKind,
  'condition' | 'toolCall' | 'validation' | 'output' | 'errorPath' | 'action'
>

const ERROR_PATH = /\b(?:if|when|should)\b[^.]*\b(?:fail|fails|failed|errors?|cannot|can't|unable)\b|^\s*on (?:failure|error)\b/i
const CONDITION = /^\s*(?:if|when|unless|whenever)\b|\?\s*$/i
const VALIDATION = /\b(?:verify|verifies|validate|validates|check|checks|ensure|ensures|confirm|confirms|assert|asserts|wait for)\b/i
const OUTPUT = /\b(?:return|returns|report|reports|output|outputs|produce|produces|emit|emits|summari[sz]e)\b/i

/**
 * First match wins. Error paths outrank plain conditions because "if the build fails"
 * is a failure branch, not a routing decision.
 */
export function classifyStatement(text: string, toolMentions: readonly string[]): StatementKind {
  const value = text.trim()
  if (value.length === 0) return 'action'
  if (ERROR_PATH.test(value)) return 'errorPath'
  if (CONDITION.test(value)) return 'condition'
  if (toolMentions.length > 0) return 'toolCall'
  if (VALIDATION.test(value)) return 'validation'
  if (OUTPUT.test(value)) return 'output'
  return 'action'
}

/** Kinds that can fail at runtime and therefore need a reachable error path. */
export function isFallible(kind: StatementKind): boolean {
  return kind === 'action' || kind === 'toolCall'
}

export function titleOf(text: string, limit = 60): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const sentence = /^(.*?[.!?])(?:\s|$)/.exec(collapsed)?.[1] ?? collapsed
  const candidate = sentence.replace(/[.!?]$/, '')
  if (candidate.length <= limit) return candidate
  return `${candidate.slice(0, limit - 1).trimEnd()}…`
}
