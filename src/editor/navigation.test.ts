import { describe, expect, it } from 'vitest'
import { testGraph, testNode } from '../testing/graph-builder.js'
import { nodeAtSourceOffset } from './navigation.js'
import type { SkillNode } from '../ir/index.js'

function spanned(id: string, startOffset: number, endOffset: number): SkillNode {
  return testNode(id, 'action', {
    source: {
      uri: 'skill.md',
      start: { line: 1, column: 1, offset: startOffset },
      end: { line: 2, column: 1, offset: endOffset },
    },
  })
}

describe('nodeAtSourceOffset', () => {
  it('breaks a tie between equal-length spans on the node id', () => {
    const graph = testGraph([spanned('zeta', 10, 30), spanned('alpha', 12, 32)])

    expect(nodeAtSourceOffset(graph, 'skill.md', 20)?.id).toBe('alpha')
  })

  it('matches an offset sitting exactly on the span start', () => {
    const graph = testGraph([spanned('only', 10, 30)])

    expect(nodeAtSourceOffset(graph, 'skill.md', 10)?.id).toBe('only')
    expect(nodeAtSourceOffset(graph, 'skill.md', 9)).toBeUndefined()
  })

  it('matches an offset sitting exactly on the span end', () => {
    const graph = testGraph([spanned('only', 10, 30)])

    expect(nodeAtSourceOffset(graph, 'skill.md', 30)?.id).toBe('only')
    expect(nodeAtSourceOffset(graph, 'skill.md', 31)).toBeUndefined()
  })

  it('returns undefined when no span contains the offset', () => {
    const graph = testGraph([spanned('first', 0, 10), spanned('second', 40, 50)])

    expect(nodeAtSourceOffset(graph, 'skill.md', 25)).toBeUndefined()
  })
})
