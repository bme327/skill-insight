import { describe, expect, it } from 'vitest'
import { testEdge, testGraph, testNode } from '../testing/graph-builder.js'
import { defaultRules } from './index.js'
import { createRuleRegistry } from './registry.js'
import type { Rule } from './types.js'

describe('createRuleRegistry', () => {
  it('exposes rules in a stable order the caller cannot mutate', () => {
    const registry = createRuleRegistry(defaultRules)
    const ids = registry.rules.map((rule) => rule.id)
    expect(Object.isFrozen(registry.rules)).toBe(true)
    expect(ids).toEqual([...ids].sort())
  })

  it('returns findings in a deterministic order regardless of rule order', () => {
    const graph = testGraph([testNode('a', 'action')])
    const forward = createRuleRegistry(defaultRules).run(graph)
    const reversed = createRuleRegistry([...defaultRules].reverse()).run(graph)
    expect(reversed).toEqual(forward)
  })

  it('accepts a new rule without any change to the registry', () => {
    const custom: Rule = {
      id: 'custom/always',
      pack: 'custom',
      description: 'test rule',
      evaluate: () => [{ ruleId: 'custom/always', severity: 'info', message: 'seen', nodeIds: [] }],
    }
    const registry = createRuleRegistry([custom])
    expect(registry.run(testGraph([])).map((finding) => finding.ruleId)).toEqual(['custom/always'])
  })

  it('is pure: running twice on the same graph gives the same result', () => {
    const registry = createRuleRegistry(defaultRules)
    const graph = testGraph(
      [testNode('t', 'trigger'), testNode('a', 'action')],
      [testEdge('t', 'a')],
    )
    expect(registry.run(graph)).toEqual(registry.run(graph))
  })
})
