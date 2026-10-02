import type { EdgeKind, SkillEdge, SkillGraph, SkillNode } from './schema.js'

export function nodeById(graph: SkillGraph, nodeId: string): SkillNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId)
}

export function outgoing(graph: SkillGraph, nodeId: string, kind?: EdgeKind): SkillEdge[] {
  return graph.edges.filter((edge) => edge.from === nodeId && (kind === undefined || edge.kind === kind))
}

export function incoming(graph: SkillGraph, nodeId: string, kind?: EdgeKind): SkillEdge[] {
  return graph.edges.filter((edge) => edge.to === nodeId && (kind === undefined || edge.kind === kind))
}

export function entryNodes(graph: SkillGraph): SkillNode[] {
  return graph.nodes.filter((node) => node.kind === 'trigger')
}

export function reachableFrom(graph: SkillGraph, startIds: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...startIds]
  while (queue.length > 0) {
    const current = queue.pop()
    if (current === undefined || seen.has(current)) continue
    seen.add(current)
    for (const edge of graph.edges) {
      if (edge.from === current && !seen.has(edge.to)) queue.push(edge.to)
    }
  }
  return seen
}

/**
 * Every distinct cycle reachable in the graph, each returned as the node ids on the loop.
 * Order within a cycle starts at the lowest id so results are comparable across runs.
 */
export function findCycles(graph: SkillGraph): string[][] {
  const cycles = new Map<string, string[]>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const visited = new Set<string>()

  const walk = (nodeId: string): void => {
    if (onStack.has(nodeId)) {
      const start = stack.indexOf(nodeId)
      if (start >= 0) {
        const cycle = stack.slice(start)
        const pivot = cycle.indexOf([...cycle].sort()[0] ?? cycle[0] ?? '')
        const normalized = [...cycle.slice(pivot), ...cycle.slice(0, pivot)]
        cycles.set(normalized.join('>'), normalized)
      }
      return
    }
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    stack.push(nodeId)
    onStack.add(nodeId)
    for (const edge of graph.edges) {
      if (edge.from === nodeId) walk(edge.to)
    }
    stack.pop()
    onStack.delete(nodeId)
  }

  for (const node of [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id))) walk(node.id)
  return [...cycles.values()]
}

export type TopologicalOrder =
  | { readonly ok: true; readonly order: readonly string[] }
  | { readonly ok: false; readonly cycle: readonly string[] }

export function topologicalOrder(graph: SkillGraph): TopologicalOrder {
  const indegree = new Map<string, number>()
  for (const node of graph.nodes) indegree.set(node.id, 0)
  for (const edge of graph.edges) indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)

  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort()
  const order: string[] = []

  while (ready.length > 0) {
    const current = ready.shift()
    if (current === undefined) break
    order.push(current)
    for (const edge of graph.edges) {
      if (edge.from !== current) continue
      const next = (indegree.get(edge.to) ?? 0) - 1
      indegree.set(edge.to, next)
      if (next === 0) {
        ready.push(edge.to)
        ready.sort()
      }
    }
  }

  if (order.length === graph.nodes.length) return { ok: true, order }
  return { ok: false, cycle: findCycles(graph)[0] ?? [] }
}

export function addNode(graph: SkillGraph, node: SkillNode): SkillGraph {
  return { ...graph, nodes: [...graph.nodes, node] }
}

export function addEdge(graph: SkillGraph, edge: SkillEdge): SkillGraph {
  return { ...graph, edges: [...graph.edges, edge] }
}

export function updateNode(
  graph: SkillGraph,
  nodeId: string,
  update: (node: SkillNode) => SkillNode,
): SkillGraph {
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === nodeId ? update(node) : node)) }
}

/** Removes the node and every edge touching it, so the result stays schema-valid. */
export function removeNode(graph: SkillGraph, nodeId: string): SkillGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges: graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
  }
}
