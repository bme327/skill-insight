import { describe, expect, it } from 'vitest'
import {
  addEdge,
  addNode,
  findCycles,
  incoming,
  nodeById,
  outgoing,
  reachableFrom,
  removeNode,
  topologicalOrder,
  updateNode,
} from './graph.js'
import { SCHEMA_VERSION } from './schema.js'
import type { SkillEdge, SkillGraph, SkillNode } from './schema.js'

function node(id: string, kind: SkillNode['kind'] = 'action'): SkillNode {
  return {
    id,
    kind,
    title: id,
    detail: '',
    source: {
      uri: 'test.md',
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 2, offset: 1 },
    },
    capabilities: [],
    inferred: false,
    confidence: 1,
    raw: {},
  }
}

function edge(from: string, to: string, kind: SkillEdge['kind'] = 'then'): SkillEdge {
  return { id: `${from}->${to}`, from, to, kind, label: '' }
}

function graphOf(nodes: SkillNode[], edges: SkillEdge[]): SkillGraph {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'skill',
    name: 'test',
    description: '',
    provider: 'markdown',
    sourceUri: 'test.md',
    declaredTools: [],
    nodes,
    edges,
    raw: {},
  }
}

const linear = graphOf(
  [node('trigger', 'trigger'), node('a'), node('b'), node('orphan')],
  [edge('trigger', 'a'), edge('a', 'b')],
)

describe('graph traversal', () => {
  it('finds nodes and adjacent edges', () => {
    expect(nodeById(linear, 'a')?.title).toBe('a')
    expect(nodeById(linear, 'missing')).toBeUndefined()
    expect(outgoing(linear, 'a').map((item) => item.to)).toEqual(['b'])
    expect(incoming(linear, 'b').map((item) => item.from)).toEqual(['a'])
  })

  it('filters adjacent edges by kind', () => {
    const withError = addEdge(linear, edge('a', 'orphan', 'onError'))
    expect(outgoing(withError, 'a', 'then').map((item) => item.to)).toEqual(['b'])
    expect(outgoing(withError, 'a', 'onError').map((item) => item.to)).toEqual(['orphan'])
  })

  it('reports reachability from the trigger', () => {
    expect([...reachableFrom(linear, ['trigger'])].sort()).toEqual(['a', 'b', 'trigger'])
  })

  it('orders a directed acyclic graph', () => {
    const result = topologicalOrder(linear)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.order.indexOf('trigger')).toBeLessThan(result.order.indexOf('a'))
      expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('b'))
    }
  })
})

describe('cycle detection', () => {
  it('reports no cycle for an acyclic graph', () => {
    expect(findCycles(linear)).toEqual([])
  })

  it('finds a cycle and reports it deterministically', () => {
    const cyclic = graphOf(
      [node('a'), node('b'), node('c')],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
    )
    expect(findCycles(cyclic)).toEqual([['a', 'b', 'c']])
    expect(topologicalOrder(cyclic).ok).toBe(false)
  })

  it('finds a self-loop', () => {
    const selfLoop = graphOf([node('a')], [edge('a', 'a')])
    expect(findCycles(selfLoop)).toEqual([['a']])
  })
})

describe('graph edits', () => {
  it('adding a node leaves the original untouched', () => {
    const next = addNode(linear, node('c'))
    expect(next.nodes).toHaveLength(5)
    expect(linear.nodes).toHaveLength(4)
    expect(next).not.toBe(linear)
  })

  it('updating a node leaves the original untouched', () => {
    const next = updateNode(linear, 'a', (target) => ({ ...target, title: 'renamed' }))
    expect(nodeById(next, 'a')?.title).toBe('renamed')
    expect(nodeById(linear, 'a')?.title).toBe('a')
  })

  it('removing a node also removes edges that touch it', () => {
    const next = removeNode(linear, 'a')
    expect(next.nodes.map((item) => item.id)).toEqual(['trigger', 'b', 'orphan'])
    expect(next.edges).toEqual([])
    expect(linear.edges).toHaveLength(2)
  })
})
