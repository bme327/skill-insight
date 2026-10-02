import { describe, expect, it } from 'vitest'
import { testEdge, testGraph, testNode } from '../testing/graph-builder.js'
import { layoutGraph } from './layout.js'

describe('layoutGraph attachments', () => {
  it('places small attachments beneath their parent without consuming graph layers', () => {
    const graph = testGraph(
      [
        testNode('parent', 'trigger'),
        testNode('input', 'input'),
        testNode('permission', 'permission'),
        testNode('next', 'action'),
      ],
      [testEdge('parent', 'next')],
    )

    const layout = layoutGraph(graph, 900, {
      attachments: {
        input: { parentId: 'parent', size: 'small' },
        permission: { parentId: 'parent', size: 'small' },
      },
    })

    const parent = layout.nodes.parent
    const input = layout.nodes.input
    const permission = layout.nodes.permission
    const next = layout.nodes.next
    if (parent === undefined || input === undefined || permission === undefined || next === undefined) {
      throw new Error('Expected all fixture nodes to be laid out')
    }

    expect(input.y).toBeGreaterThan(parent.y + parent.height)
    expect(permission.y).toBe(input.y)
    expect(input.width).toBeLessThan(parent.width)
    expect(permission.x).toBeGreaterThan(input.x)
    expect(next.x).toBeGreaterThan(parent.x)
  })

  it('gives validation attachments more space than small attachments', () => {
    const graph = testGraph([
      testNode('parent', 'toolCall'),
      testNode('validation', 'validation'),
      testNode('error', 'errorPath'),
    ])

    const layout = layoutGraph(graph, 900, {
      attachments: {
        validation: { parentId: 'parent', size: 'medium' },
        error: { parentId: 'parent', size: 'small' },
      },
    })

    const validation = layout.nodes.validation
    const error = layout.nodes.error
    if (validation === undefined || error === undefined) throw new Error('Expected attachments to be laid out')

    expect(validation.width).toBeGreaterThan(error.width)
    expect(validation.height).toBeGreaterThan(error.height)
  })

  it('places right attachments beside their parent', () => {
    const graph = testGraph(
      [testNode('action', 'action'), testNode('output', 'output')],
      [testEdge('action', 'output')],
    )

    const layout = layoutGraph(graph, 900, {
      attachments: { output: { parentId: 'action', size: 'small', placement: 'right' } },
    })

    const action = layout.nodes.action
    const output = layout.nodes.output
    if (action === undefined || output === undefined) throw new Error('Expected attachment to be laid out')
    expect(output.x).toBeGreaterThan(action.x + action.width)
    expect(output.y).toBeGreaterThanOrEqual(action.y)
    expect(output.y).toBeLessThan(action.y + action.height)
  })
})