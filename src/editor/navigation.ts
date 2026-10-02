import type { SkillGraph, SkillNode } from '../ir/index.js'

export function nodeAtSourceOffset(graph: SkillGraph, uri: string, offset: number): SkillNode | undefined {
  return graph.nodes
    .filter((node) => node.source.uri === uri && node.source.start.offset <= offset && offset <= node.source.end.offset)
    .sort((left, right) => {
      const leftLength = left.source.end.offset - left.source.start.offset
      const rightLength = right.source.end.offset - right.source.start.offset
      return leftLength - rightLength || left.id.localeCompare(right.id)
    })[0]
}