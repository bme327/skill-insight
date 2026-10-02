import { describe, expect, it } from 'vitest'
import { testGraph, testNode } from '../../testing/graph-builder.js'
import { brokenReference } from './references.js'

describe('references/broken-reference', () => {
  it('fires for a reference that escaped the allowed root', () => {
    const graph = testGraph([
      testNode('r', 'reference', {
        title: '../../.env',
        raw: { resolved: null, rejection: 'escapes-root' },
      }),
    ])
    const findings = brokenReference.evaluate(graph)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('outside the allowed root')
  })

  it('stays quiet for a reference that resolved', () => {
    const graph = testGraph([
      testNode('r', 'reference', { title: 'docs/guide.md', raw: { resolved: 'root/docs/guide.md', rejection: null } }),
    ])
    expect(brokenReference.evaluate(graph)).toEqual([])
  })

  // Only reference nodes carry a resolution verdict; other kinds must be left alone.
  it('does not inspect non-reference nodes that happen to carry raw data', () => {
    const graph = testGraph([
      testNode('a', 'action', { raw: { rejection: 'escapes-root' } }),
    ])
    expect(brokenReference.evaluate(graph)).toEqual([])
  })
})
