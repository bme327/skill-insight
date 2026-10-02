import { describe, expect, it } from 'vitest'
import { testGraph, testNode } from '../testing/graph-builder.js'
import { parseAssessment } from './parse.js'

const graph = testGraph([testNode('n1', 'action'), testNode('n2', 'condition')])

function response(findings: unknown, summary = 'A short summary.'): string {
  return JSON.stringify({ summary, findings })
}

describe('parseAssessment', () => {
  it('anchors findings to real nodes and marks them as AI', () => {
    const raw = response([{ nodeId: 'n1', category: 'clarity', severity: 'warning', message: 'Step is ambiguous.' }])

    const result = parseAssessment(graph, raw)

    expect(result.malformed).toBe(false)
    expect(result.summary).toBe('A short summary.')
    expect(result.findings).toEqual([{
      ruleId: 'ai/clarity',
      severity: 'warning',
      message: 'Step is ambiguous.',
      nodeIds: ['n1'],
      source: graph.nodes[0]?.source,
      provenance: 'ai',
    }])
  })

  it('takes the span from the graph, never from the model', () => {
    const raw = JSON.stringify({
      findings: [{
        nodeId: 'n1',
        message: 'Problem.',
        source: { uri: '../../etc/passwd', start: { line: 9, column: 9, offset: 9 }, end: { line: 9, column: 9, offset: 9 } },
      }],
    })

    const result = parseAssessment(graph, raw)

    expect(result.findings[0]?.source).toEqual(graph.nodes[0]?.source)
  })

  it('drops findings that reference unknown nodes', () => {
    const raw = response([
      { nodeId: 'ghost', message: 'Invented.' },
      { nodeId: 'n2', message: 'Real.' },
    ])

    const result = parseAssessment(graph, raw)

    expect(result.rejected).toBe(1)
    expect(result.findings).toHaveLength(1)
  })

  it('reads a fenced response', () => {
    const raw = '```json\n' + response([{ nodeId: 'n1', message: 'Fenced.' }]) + '\n```'

    expect(parseAssessment(graph, raw).findings).toHaveLength(1)
  })

  it('reads JSON surrounded by prose', () => {
    const raw = `Sure, here is the review:\n${response([{ nodeId: 'n1', message: 'Wrapped.' }])}\nHope that helps.`

    expect(parseAssessment(graph, raw).findings).toHaveLength(1)
  })

  it('reports malformed output instead of throwing', () => {
    const result = parseAssessment(graph, 'I am afraid I cannot do that.')

    expect(result).toEqual({ summary: '', findings: [], rejected: 0, malformed: true })
  })

  it('strips control characters from model text', () => {
    const raw = response([{ nodeId: 'n1', message: 'Line\u0000one\u001btwo' }], 'Sum\u0007mary')

    const result = parseAssessment(graph, raw)

    expect(result.findings[0]?.message).toBe('Line one two')
    expect(result.summary).toBe('Sum mary')
  })

  it('never lets the model raise an error-severity finding', () => {
    const raw = response([{ nodeId: 'n1', severity: 'error', message: 'Critical.' }])

    expect(parseAssessment(graph, raw).findings[0]?.severity).toBe('warning')
  })

  it('falls back to a general rule id for unknown categories', () => {
    const raw = response([{ nodeId: 'n1', category: 'vibes', message: 'Odd.' }])

    expect(parseAssessment(graph, raw).findings[0]?.ruleId).toBe('ai/general')
  })

  it('caps the finding count and counts the overflow as rejected', () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ nodeId: 'n1', message: `Issue ${index}.` }))

    const result = parseAssessment(graph, response(many))

    expect(result.findings).toHaveLength(20)
    expect(result.rejected).toBe(5)
  })

  it('collapses duplicate findings', () => {
    const raw = response([
      { nodeId: 'n1', category: 'safety', message: 'Same.' },
      { nodeId: 'n1', category: 'safety', message: 'Same.' },
    ])

    expect(parseAssessment(graph, raw).findings).toHaveLength(1)
  })

  it('accepts a sound skill with no findings', () => {
    const result = parseAssessment(graph, response([]))

    expect(result.findings).toEqual([])
    expect(result.malformed).toBe(false)
  })
})
