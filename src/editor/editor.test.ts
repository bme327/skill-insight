import { describe, expect, it } from 'vitest'
import { testEdge, testGraph, testNode } from '../testing/graph-builder.js'
import {
  applyNodePosition,
  clampZoom,
  createEditorHistory,
  fitGraphZoom,
  findingsByNode,
  layoutGraph,
  MAX_ZOOM,
  MIN_ZOOM,
  needsMinimap,
  nodeAtSourceOffset,
  redo,
  stepZoom,
  undo,
  updateHistory,
  viewportFromScroll,
  visibleNodeIds,
} from './index.js'

describe('visual editor model', () => {
  it('lays out graph layers and preserves a manual node position in the IR', () => {
    const graph = testGraph(
      [testNode('trigger', 'trigger'), testNode('action', 'action'), testNode('output', 'output')],
      [testEdge('trigger', 'action'), testEdge('action', 'output')],
    )

    const automatic = layoutGraph(graph)
    expect(automatic.nodes.trigger?.x).toBeLessThan(automatic.nodes.action?.x ?? 0)
    expect(automatic.nodes.action?.x).toBeLessThan(automatic.nodes.output?.x ?? 0)

    const moved = applyNodePosition(graph, 'action', { x: 440, y: 275 })
    expect(moved).not.toBe(graph)
    expect(graph.raw).toEqual({})
    expect(layoutGraph(moved).nodes.action).toMatchObject({ x: 440, y: 275, manual: true })
  })

  it('wraps automatic flow blocks within the client width', () => {
    const graph = testGraph(
      [testNode('trigger', 'trigger'), testNode('action', 'action'), testNode('output', 'output')],
      [testEdge('trigger', 'action'), testEdge('action', 'output')],
    )

    const layout = layoutGraph(graph, 500)

    expect(layout.width).toBe(500)
    expect(layout.nodes.action?.y).toBeGreaterThan(layout.nodes.trigger?.y ?? 0)
    expect(layout.nodes.output?.y).toBeGreaterThan(layout.nodes.action?.y ?? 0)
    expect(Math.max(...Object.values(layout.nodes).map((node) => node.x + node.width))).toBeLessThanOrEqual(500)
  })

  it('returns only nodes intersecting the visible viewport', () => {
    const graph = testGraph([testNode('first', 'trigger'), testNode('second', 'action')])
    const layout = layoutGraph(
      applyNodePosition(applyNodePosition(graph, 'first', { x: 10, y: 10 }), 'second', { x: 1_000, y: 1_000 }),
    )

    expect(visibleNodeIds(layout, { x: 0, y: 0, width: 500, height: 400 }, 0)).toEqual(['first'])
  })

  it('bounds zoom and converts a scaled scroll viewport into graph coordinates', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
    expect(clampZoom(3)).toBe(MAX_ZOOM)
    expect(stepZoom(1, -1)).toBe(0.9)
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(0.1, 1)).toBe(MIN_ZOOM)
    expect(stepZoom(0.1, -1)).toBe(0.1)
    expect(viewportFromScroll(200, 100, 800, 600, 0.5)).toEqual({
      x: 400,
      y: 200,
      width: 1_600,
      height: 1_200,
    })
  })

  it('fits the complete layout without enlarging small graphs', () => {
    const layout = {
      nodes: {},
      width: 1_000,
      height: 800,
    }

    expect(fitGraphZoom(layout, { width: 500, height: 400 }, 0)).toBe(0.5)
    expect(fitGraphZoom(layout, { width: 2_000, height: 1_600 }, 0)).toBe(1)
    expect(fitGraphZoom(
      { ...layout, height: 8_000 },
      { width: 500, height: 400 },
      0,
    )).toBe(0.05)
    expect(viewportFromScroll(0, 0, 500, 400, 0.05)).toEqual({
      x: 0,
      y: 0,
      width: 10_000,
      height: 8_000,
    })
  })

  it('shows a minimap only when the viewport does not cover the layout', () => {
    const layout = {
      nodes: {},
      width: 1_000,
      height: 800,
    }

    expect(needsMinimap(layout, { x: 0, y: 0, width: 500, height: 800 })).toBe(true)
    expect(needsMinimap(layout, { x: 0, y: 0, width: 1_000, height: 800 })).toBe(false)
  })

  it('undoes and redoes immutable graph edits', () => {
    const graph = testGraph([testNode('action', 'action')])
    const history = createEditorHistory(graph)
    const edited = { ...graph, name: 'edited' }

    const committed = updateHistory(history, edited)
    expect(undo(committed).present).toBe(graph)
    expect(redo(undo(committed)).present).toBe(edited)
    expect(graph.name).toBe('test')
  })

  it('resolves cursor movement to the innermost source node', () => {
    const outer = testNode('outer', 'instruction', {
      source: {
        uri: 'skill.md',
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 10, column: 1, offset: 100 },
      },
    })
    const inner = testNode('inner', 'action', {
      source: {
        uri: 'skill.md',
        start: { line: 4, column: 1, offset: 30 },
        end: { line: 5, column: 1, offset: 50 },
      },
    })

    expect(nodeAtSourceOffset(testGraph([outer, inner]), 'skill.md', 40)?.id).toBe('inner')
    expect(nodeAtSourceOffset(testGraph([outer, inner]), 'other.md', 40)).toBeUndefined()
  })

  it('indexes findings over every affected node', () => {
    const indexed = findingsByNode([
      {
        ruleId: 'permissions.broad',
        severity: 'warning',
        message: 'Broad permission',
        nodeIds: ['first', 'second'],
      },
    ])

    expect(indexed.get('first')?.[0]?.ruleId).toBe('permissions.broad')
    expect(indexed.get('second')?.[0]?.severity).toBe('warning')
  })
})