import { describe, expect, it } from 'vitest'
import { testEdge, testGraph, testNode } from '../testing/graph-builder.js'
import {
  DEFAULT_FLOW_VIEW_STATE,
  builtInFlowFilters,
  projectFlowView,
} from './flow-view.js'
import type { FlowViewContext, FlowViewState } from './flow-view.js'

const EMPTY_CONTEXT: FlowViewContext = {
  findings: [],
  outsideWorkspaceReferenceNodeIds: [],
}

function state(overrides: Partial<FlowViewState> = {}): FlowViewState {
  return { ...DEFAULT_FLOW_VIEW_STATE, ...overrides }
}

describe('projectFlowView', () => {
  it('collapses a linear same-kind run without mutating the graph', () => {
    const graph = testGraph(
      [testNode('start', 'trigger'), testNode('one', 'action'), testNode('two', 'action'), testNode('three', 'action')],
      [testEdge('start', 'one'), testEdge('one', 'two'), testEdge('two', 'three')],
    )
    const original = structuredClone(graph)

    const projection = projectFlowView(graph, state(), EMPTY_CONTEXT, builtInFlowFilters)

    expect(projection.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'group', childNodeIds: ['one', 'two', 'three'] }),
    ]))
    expect(projection.nodes).toHaveLength(2)
    expect(graph).toEqual(original)
  })

  it('does not group across a branch or merge', () => {
    const graph = testGraph(
      [testNode('one', 'action'), testNode('two', 'action'), testNode('branch', 'action'), testNode('merge', 'action')],
      [testEdge('one', 'two'), testEdge('one', 'branch'), testEdge('two', 'merge'), testEdge('branch', 'merge')],
    )

    const projection = projectFlowView(graph, state(), EMPTY_CONTEXT, builtInFlowFilters)

    expect(projection.nodes.every((node) => node.type === 'source')).toBe(true)
  })

  it('groups reference siblings only in overview', () => {
    const graph = testGraph(
      [testNode('parent', 'instruction'), testNode('first', 'reference'), testNode('second', 'reference')],
      [testEdge('parent', 'first'), testEdge('parent', 'second')],
    )

    const overview = projectFlowView(graph, state(), EMPTY_CONTEXT, builtInFlowFilters)
    const grouped = projectFlowView(graph, state({ level: 'grouped' }), EMPTY_CONTEXT, builtInFlowFilters)

    expect(overview.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'group',
        groupKind: 'references',
        childNodeIds: ['first', 'second'],
        attachedToId: 'parent',
        attachmentSize: 'small',
      }),
    ]))
    expect(grouped.nodes.map((node) => node.id)).toEqual(['first', 'parent', 'second'])
  })

  it('combines dangerous and external filters with OR semantics', () => {
    const graph = testGraph([
      testNode('danger', 'action'),
      testNode('network', 'toolCall', { capabilities: [{ kind: 'network', value: 'api.example.com', declared: true }] }),
      testNode('routine', 'toolCall', { capabilities: [{ kind: 'tool', value: 'read', declared: true }] }),
    ])
    const context: FlowViewContext = {
      findings: [{
        ruleId: 'permissions/destructive-action',
        severity: 'warning',
        message: 'Destructive command',
        nodeIds: ['danger'],
      }],
      outsideWorkspaceReferenceNodeIds: [],
    }

    const projection = projectFlowView(
      graph,
      state({ level: 'detail', activeFilterIds: ['dangerous', 'external'] }),
      context,
      builtInFlowFilters,
    )

    expect(projection.nodes.map((node) => node.id)).toEqual(['danger', 'network'])
    expect(projection.matchingSourceNodeCount).toBe(2)
  })

  it('filters to every block with a finding', () => {
    const graph = testGraph([
      testNode('clean', 'action'),
      testNode('warning', 'action'),
      testNode('error', 'validation'),
    ])
    const context: FlowViewContext = {
      findings: [
        { ruleId: 'structure/test', severity: 'warning', message: 'Warning', nodeIds: ['warning'] },
        { ruleId: 'security/test', severity: 'error', message: 'Error', nodeIds: ['error'] },
      ],
      outsideWorkspaceReferenceNodeIds: [],
    }

    const projection = projectFlowView(
      graph,
      state({ level: 'detail', activeFilterIds: ['findings'] }),
      context,
      builtInFlowFilters,
    )

    expect(projection.nodes.map((node) => node.id)).toEqual(['error', 'warning'])
    expect(projection.matchingSourceNodeCount).toBe(2)
  })

  it('retains deterministic shortest-path context between matches', () => {
    const graph = testGraph(
      [
        testNode('first', 'action'),
        testNode('context-a', 'instruction'),
        testNode('context-b', 'instruction'),
        testNode('second', 'toolCall', { capabilities: [{ kind: 'network', value: 'remote', declared: true }] }),
      ],
      [
        testEdge('first', 'context-a'),
        testEdge('context-a', 'second'),
        testEdge('first', 'context-b'),
        testEdge('context-b', 'second'),
      ],
    )
    const context: FlowViewContext = {
      findings: [{ ruleId: 'security/prompt-injection', severity: 'error', message: 'Unsafe', nodeIds: ['first'] }],
      outsideWorkspaceReferenceNodeIds: [],
    }

    const projection = projectFlowView(
      graph,
      state({ level: 'detail', activeFilterIds: ['dangerous', 'external'] }),
      context,
      builtInFlowFilters,
    )

    expect(projection.nodes.map((node) => node.id)).toEqual(['context-a', 'first', 'second'])
    expect(projection.nodes.find((node) => node.id === 'context-a')).toEqual(
      expect.objectContaining({ contextOnly: true }),
    )
  })

  it('keeps a matching group collapsed and summarizes matches and findings', () => {
    const graph = testGraph(
      [testNode('one', 'action'), testNode('two', 'action'), testNode('three', 'action')],
      [testEdge('one', 'two'), testEdge('two', 'three')],
    )
    const context: FlowViewContext = {
      findings: [{
        ruleId: 'permissions/destructive-action',
        severity: 'warning',
        message: 'Destructive command',
        nodeIds: ['two'],
      }],
      outsideWorkspaceReferenceNodeIds: [],
    }

    const projection = projectFlowView(
      graph,
      state({ activeFilterIds: ['dangerous'] }),
      context,
      builtInFlowFilters,
    )

    expect(projection.nodes).toEqual([
      expect.objectContaining({ type: 'group', matchCount: 1, findingCount: 1, highestFindingSeverity: 'warning' }),
    ])
  })

  it('matches outside-workspace references but not ordinary declared tools', () => {
    const graph = testGraph([
      testNode('outside', 'reference'),
      testNode('tool', 'toolCall', { capabilities: [{ kind: 'tool', value: 'read', declared: true }] }),
    ])

    const projection = projectFlowView(
      graph,
      state({ level: 'detail', activeFilterIds: ['dangerous', 'external'] }),
      { findings: [], outsideWorkspaceReferenceNodeIds: ['outside'] },
      builtInFlowFilters,
    )

    expect(projection.nodes.map((node) => node.id)).toEqual(['outside'])
  })

  it('ignores persisted filter IDs that are no longer registered', () => {
    const graph = testGraph([testNode('one', 'action'), testNode('two', 'instruction')])

    const projection = projectFlowView(
      graph,
      state({ level: 'detail', activeFilterIds: ['removed-filter'] }),
      EMPTY_CONTEXT,
      builtInFlowFilters,
    )

    expect(projection.nodes.map((node) => node.id)).toEqual(['one', 'two'])
    expect(projection.matchingSourceNodeCount).toBe(2)
  })

  it('attaches supporting nodes to their direct predecessor and preserves main flow', () => {
    const graph = testGraph(
      [
        testNode('trigger', 'trigger'),
        testNode('input', 'input'),
        testNode('permission', 'permission'),
        testNode('action', 'action'),
        testNode('validation', 'validation'),
        testNode('error', 'errorPath'),
        testNode('output', 'output'),
        testNode('reference', 'reference'),
      ],
      [
        testEdge('trigger', 'input', 'dataFlow'),
        testEdge('trigger', 'permission'),
        testEdge('permission', 'action'),
        testEdge('action', 'validation'),
        testEdge('validation', 'output'),
        testEdge('action', 'error', 'onError'),
        testEdge('output', 'reference', 'dataFlow'),
      ],
    )

    const projection = projectFlowView(graph, state({ level: 'detail' }), EMPTY_CONTEXT, builtInFlowFilters)

    expect(projection.nodes.find((node) => node.id === 'input')).toEqual(expect.objectContaining({
      type: 'source', attachedToId: 'trigger', attachmentSize: 'small',
    }))
    expect(projection.nodes.find((node) => node.id === 'permission')).toEqual(expect.objectContaining({
      attachedToId: 'trigger', attachmentSize: 'small',
    }))
    expect(projection.nodes.find((node) => node.id === 'validation')).toEqual(expect.objectContaining({
      attachedToId: 'action', attachmentSize: 'medium',
    }))
    expect(projection.nodes.find((node) => node.id === 'error')).toEqual(expect.objectContaining({
      attachedToId: 'action', attachmentSize: 'small',
    }))
    expect(projection.nodes.find((node) => node.id === 'reference')).toEqual(expect.objectContaining({
      attachedToId: 'action', attachmentSize: 'small', attachmentPlacement: 'below',
    }))
    expect(projection.edges.map((edge) => [edge.from, edge.to, edge.kind])).toEqual([
      ['trigger', 'action', 'then'],
    ])
    expect(projection.nodes.find((node) => node.id === 'output')).toEqual(expect.objectContaining({
      attachedToId: 'action', attachmentSize: 'small', attachmentPlacement: 'right',
    }))
  })

  it('attaches output runs through validations to the nearest action and bypasses the run', () => {
    const graph = testGraph(
      [
        testNode('producer', 'toolCall'),
        testNode('validation', 'validation'),
        testNode('first-output', 'output'),
        testNode('second-output', 'output'),
        testNode('next', 'action'),
      ],
      [
        testEdge('producer', 'validation'),
        testEdge('validation', 'first-output'),
        testEdge('first-output', 'second-output'),
        testEdge('second-output', 'next'),
      ],
    )

    const projection = projectFlowView(graph, state({ level: 'detail' }), EMPTY_CONTEXT, builtInFlowFilters)

    expect(projection.nodes.filter((node) => ['validation', 'first-output', 'second-output'].includes(node.id)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'validation', attachedToId: 'producer', attachmentPlacement: 'below' }),
        expect.objectContaining({ id: 'first-output', attachedToId: 'producer', attachmentPlacement: 'right' }),
        expect.objectContaining({ id: 'second-output', attachedToId: 'producer', attachmentPlacement: 'right' }),
      ]))
    expect(projection.edges.map((edge) => [edge.from, edge.to, edge.kind])).toEqual([
      ['producer', 'next', 'then'],
    ])
  })
})