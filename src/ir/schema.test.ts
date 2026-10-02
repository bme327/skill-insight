import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, emptyGraph, safeParseSkillGraph } from './schema.js'

const base = emptyGraph({ id: 'skill', name: 'test', provider: 'markdown', sourceUri: 'test.md' })

const sampleNode = {
  id: 'a',
  kind: 'action' as const,
  title: 'A',
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

describe('skillGraphSchema', () => {
  it('accepts an empty graph', () => {
    expect(safeParseSkillGraph(base).success).toBe(true)
    expect(base.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('rejects an unknown schema version', () => {
    expect(safeParseSkillGraph({ ...base, schemaVersion: '0.0.1' }).success).toBe(false)
  })

  it('rejects duplicate node ids', () => {
    const result = safeParseSkillGraph({ ...base, nodes: [sampleNode, sampleNode] })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('duplicate node id')
  })

  it('rejects an edge pointing at a node that does not exist', () => {
    const result = safeParseSkillGraph({
      ...base,
      nodes: [sampleNode],
      edges: [{ id: 'e', from: 'a', to: 'ghost', kind: 'then', label: '' }],
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('unknown target')
  })

  it('accepts an edge between two declared nodes', () => {
    const result = safeParseSkillGraph({
      ...base,
      nodes: [sampleNode, { ...sampleNode, id: 'b' }],
      edges: [{ id: 'e', from: 'a', to: 'b', kind: 'then', label: '' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a confidence outside the unit interval', () => {
    const result = safeParseSkillGraph({ ...base, nodes: [{ ...sampleNode, confidence: 1.5 }] })
    expect(result.success).toBe(false)
  })
})
