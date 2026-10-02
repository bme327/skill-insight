import type { Finding, SkillGraph } from '../ir/index.js'
import { sortFindings } from '../ir/index.js'
import type { Rule } from './types.js'

export interface RuleRegistry {
  readonly rules: readonly Rule[]
  run(graph: SkillGraph): Finding[]
}

/**
 * Rules are supplied by the caller; adding a check never means editing this file.
 */
export function createRuleRegistry(rules: readonly Rule[]): RuleRegistry {
  const frozen = Object.freeze([...rules].sort((a, b) => a.id.localeCompare(b.id)))
  return {
    rules: frozen,
    run(graph) {
      return sortFindings(frozen.flatMap((rule) => rule.evaluate(graph)))
    },
  }
}
