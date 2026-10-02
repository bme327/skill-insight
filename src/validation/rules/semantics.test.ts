import { describe, expect, it } from 'vitest'
import { command, testEdge, testGraph, testNode, tool } from '../../testing/graph-builder.js'
import { ambiguousCondition, missingErrorPath } from './semantics.js'

describe('semantics/ambiguous-condition', () => {
  it('fires when a condition has only one branch', () => {
    const graph = testGraph(
      [testNode('c', 'condition'), testNode('a', 'action')],
      [testEdge('c', 'a')],
    )
    expect(ambiguousCondition.evaluate(graph)).toHaveLength(1)
  })

  it('stays quiet when an else branch exists', () => {
    const graph = testGraph(
      [testNode('c', 'condition'), testNode('a', 'action'), testNode('b', 'action')],
      [testEdge('c', 'a'), testEdge('c', 'b', 'else')],
    )
    expect(ambiguousCondition.evaluate(graph)).toEqual([])
  })

  // A data edge is not an alternative branch and must not satisfy the rule.
  it('does not accept a data flow edge as the second branch', () => {
    const graph = testGraph(
      [testNode('c', 'condition'), testNode('a', 'action'), testNode('i', 'input')],
      [testEdge('c', 'a'), testEdge('c', 'i', 'dataFlow')],
    )
    expect(ambiguousCondition.evaluate(graph)).toHaveLength(1)
  })
})

describe('resilience/missing-error-path', () => {
  it('fires for a tool call with no failure route', () => {
    const graph = testGraph([
      testNode('a', 'toolCall', { capabilities: [tool('run_task', true)] }),
    ])
    expect(missingErrorPath.evaluate(graph)).toHaveLength(1)
  })

  it('stays quiet when an error path is downstream', () => {
    const graph = testGraph(
      [
        testNode('a', 'toolCall', { capabilities: [tool('run_task', true)] }),
        testNode('e', 'errorPath'),
      ],
      [testEdge('a', 'e', 'onError')],
    )
    expect(missingErrorPath.evaluate(graph)).toEqual([])
  })

  // Coverage is transitive: a later error path protects the whole chain.
  it('accepts an error path reached further down the chain', () => {
    const graph = testGraph(
      [
        testNode('a', 'action', { capabilities: [command('npm run build')] }),
        testNode('b', 'action'),
        testNode('e', 'errorPath'),
      ],
      [testEdge('a', 'b'), testEdge('b', 'e', 'onError')],
    )
    expect(missingErrorPath.evaluate(graph)).toEqual([])
  })

  it('does not fire for a block that never leaves the process', () => {
    const graph = testGraph([testNode('a', 'action', { title: 'Summarise the findings' })])
    expect(missingErrorPath.evaluate(graph)).toEqual([])
  })
})
