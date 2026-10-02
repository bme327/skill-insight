import { describe, expect, it } from 'vitest'
import { testEdge, testGraph, testNode } from '../testing/graph-builder.js'
import { applyNodePosition, layoutGraph } from './layout.js'
import { visibleNodeIds } from './viewport.js'
import type { SkillGraph } from '../ir/index.js'

/** Automatic layout gives every block a 240x112 box; positions are pinned to control the geometry. */
function layoutAt(positions: Readonly<Record<string, { x: number; y: number }>>) {
  const graph = Object.keys(positions).reduce<SkillGraph>(
    (current, nodeId) => applyNodePosition(current, nodeId, positions[nodeId] ?? { x: 0, y: 0 }),
    testGraph(Object.keys(positions).map((nodeId) => testNode(nodeId, 'action'))),
  )
  return layoutGraph(graph)
}

describe('visibleNodeIds', () => {
  it('includes a node inside the default overscan margin that a zero overscan excludes', () => {
    const layout = layoutAt({ inside: { x: 10, y: 10 }, margin: { x: 600, y: 0 } })
    const viewport = { x: 0, y: 0, width: 500, height: 400 }

    expect(visibleNodeIds(layout, viewport)).toEqual(['inside', 'margin'])
    expect(visibleNodeIds(layout, viewport, 0)).toEqual(['inside'])
  })

  it('includes a node whose edge exactly touches the viewport edge', () => {
    const layout = layoutAt({ left: { x: -240, y: 0 }, right: { x: 500, y: 0 } })

    expect(visibleNodeIds(layout, { x: 0, y: 0, width: 500, height: 400 }, 0)).toEqual(['left', 'right'])
  })

  it('returns ids sorted rather than in layout insertion order', () => {
    const graph = testGraph(
      [testNode('zeta', 'trigger'), testNode('alpha', 'action')],
      [testEdge('zeta', 'alpha')],
    )
    const layout = layoutGraph(graph)
    expect(Object.keys(layout.nodes)).toEqual(['zeta', 'alpha'])

    expect(visibleNodeIds(layout, { x: 0, y: 0, width: 2_000, height: 2_000 }, 0)).toEqual(['alpha', 'zeta'])
  })

  it('returns nothing for a viewport far from every node', () => {
    const layout = layoutAt({ only: { x: 0, y: 0 } })

    expect(visibleNodeIds(layout, { x: 100_000, y: 100_000, width: 500, height: 400 })).toEqual([])
  })
})
