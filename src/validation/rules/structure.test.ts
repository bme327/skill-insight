import { describe, expect, it } from 'vitest'
import { testEdge, testGraph, testNode } from '../../testing/graph-builder.js'
import { circularFlow, noTrigger, unreachableNode } from './structure.js'

describe('structure/no-trigger', () => {
  it('fires when nothing can start the skill', () => {
    const graph = testGraph([testNode('a', 'action')])
    expect(noTrigger.evaluate(graph).map((finding) => finding.ruleId)).toEqual(['structure/no-trigger'])
  })

  it('stays quiet when a trigger exists', () => {
    const graph = testGraph([testNode('t', 'trigger'), testNode('a', 'action')])
    expect(noTrigger.evaluate(graph)).toEqual([])
  })

  // An empty graph is a parse problem, already reported by the parser.
  it('does not double-report an empty graph', () => {
    expect(noTrigger.evaluate(testGraph([]))).toEqual([])
  })
})

describe('structure/unreachable-node', () => {
  it('fires for a block no trigger can reach', () => {
    const graph = testGraph(
      [testNode('t', 'trigger'), testNode('a', 'action'), testNode('stranded', 'action')],
      [testEdge('t', 'a')],
    )
    expect(unreachableNode.evaluate(graph).map((finding) => finding.nodeIds)).toEqual([['stranded']])
  })

  it('stays quiet when every block is reachable', () => {
    const graph = testGraph(
      [testNode('t', 'trigger'), testNode('a', 'action'), testNode('b', 'action')],
      [testEdge('t', 'a'), testEdge('a', 'b')],
    )
    expect(unreachableNode.evaluate(graph)).toEqual([])
  })

  // Reachability through a non-linear edge kind still counts as reachable.
  it('does not fire for a block reached only through an error edge', () => {
    const graph = testGraph(
      [testNode('t', 'trigger'), testNode('a', 'action'), testNode('e', 'errorPath')],
      [testEdge('t', 'a'), testEdge('a', 'e', 'onError')],
    )
    expect(unreachableNode.evaluate(graph)).toEqual([])
  })

  it('defers to no-trigger when there is no entry point at all', () => {
    expect(unreachableNode.evaluate(testGraph([testNode('a', 'action')]))).toEqual([])
  })
})

describe('structure/circular-flow', () => {
  it('fires on a loop', () => {
    const graph = testGraph(
      [testNode('a', 'action'), testNode('b', 'action')],
      [testEdge('a', 'b'), testEdge('b', 'a')],
    )
    expect(circularFlow.evaluate(graph)[0]?.nodeIds).toEqual(['a', 'b'])
  })

  it('stays quiet on a linear flow', () => {
    const graph = testGraph(
      [testNode('a', 'action'), testNode('b', 'action')],
      [testEdge('a', 'b')],
    )
    expect(circularFlow.evaluate(graph)).toEqual([])
  })

  // Two paths that rejoin look like a loop only if reachability is confused with cycling.
  it('does not fire on a diamond', () => {
    const graph = testGraph(
      [testNode('a', 'condition'), testNode('b', 'action'), testNode('c', 'action'), testNode('d', 'action')],
      [testEdge('a', 'b'), testEdge('a', 'c', 'else'), testEdge('b', 'd'), testEdge('c', 'd')],
    )
    expect(circularFlow.evaluate(graph)).toEqual([])
  })
})
