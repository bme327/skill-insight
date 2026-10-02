import { SCHEMA_VERSION } from '../ir/index.js'
import type { Capability, SkillEdge, SkillGraph, SkillNode } from '../ir/index.js'

const SPAN = {
  uri: 'test.md',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 2, offset: 1 },
}

export function testNode(
  id: string,
  kind: SkillNode['kind'],
  overrides: Partial<Omit<SkillNode, 'id' | 'kind'>> = {},
): SkillNode {
  return {
    id,
    kind,
    title: overrides.title ?? id,
    detail: overrides.detail ?? '',
    source: overrides.source ?? SPAN,
    capabilities: overrides.capabilities ?? [],
    inferred: overrides.inferred ?? false,
    confidence: overrides.confidence ?? 1,
    raw: overrides.raw ?? {},
  }
}

export function tool(value: string, declared: boolean): Capability {
  return { kind: 'tool', value, declared }
}

export function command(value: string): Capability {
  return { kind: 'process', value, declared: false }
}

export function testEdge(from: string, to: string, kind: SkillEdge['kind'] = 'then'): SkillEdge {
  return { id: `${from}->${to}:${kind}`, from, to, kind, label: '' }
}

export function testGraph(nodes: readonly SkillNode[], edges: readonly SkillEdge[] = []): SkillGraph {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'skill',
    name: 'test',
    description: '',
    provider: 'markdown',
    sourceUri: 'test.md',
    declaredTools: [],
    nodes: [...nodes],
    edges: [...edges],
    raw: {},
  }
}
