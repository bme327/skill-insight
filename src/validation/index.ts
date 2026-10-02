import { brokenReference } from './rules/references.js'
import { destructiveAction, undeclaredTool } from './rules/permissions.js'
import { promptInjection } from './rules/security.js'
import { ambiguousCondition, missingErrorPath } from './rules/semantics.js'
import { circularFlow, noTrigger, unreachableNode } from './rules/structure.js'
import { createRuleRegistry } from './registry.js'
import type { RuleRegistry } from './registry.js'
import type { Rule } from './types.js'

export { createRuleRegistry } from './registry.js'
export type { RuleRegistry } from './registry.js'
export type { Rule } from './types.js'
export { brokenReference } from './rules/references.js'
export { destructiveAction, undeclaredTool } from './rules/permissions.js'
export { promptInjection } from './rules/security.js'
export { ambiguousCondition, missingErrorPath } from './rules/semantics.js'
export { circularFlow, noTrigger, unreachableNode } from './rules/structure.js'

export const defaultRules: readonly Rule[] = Object.freeze([
  noTrigger,
  unreachableNode,
  circularFlow,
  brokenReference,
  undeclaredTool,
  destructiveAction,
  ambiguousCondition,
  missingErrorPath,
  promptInjection,
])

export function createDefaultRuleRegistry(): RuleRegistry {
  return createRuleRegistry(defaultRules)
}
