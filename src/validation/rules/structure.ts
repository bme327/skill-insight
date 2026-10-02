import { entryNodes, findCycles, reachableFrom } from '../../ir/index.js'
import type { Finding } from '../../ir/index.js'
import type { Rule } from '../types.js'

export const noTrigger: Rule = {
  id: 'structure/no-trigger',
  pack: 'structure',
  description: 'A skill needs at least one trigger, otherwise nothing can start it.',
  evaluate(graph) {
    if (graph.nodes.length === 0) return []
    if (entryNodes(graph).length > 0) return []
    return [
      {
        ruleId: 'structure/no-trigger',
        severity: 'error',
        message: 'No trigger block was found, so the skill has no entry point.',
        nodeIds: [],
      },
    ]
  },
}

export const unreachableNode: Rule = {
  id: 'structure/unreachable-node',
  pack: 'structure',
  description: 'Every block must be reachable from a trigger.',
  evaluate(graph) {
    const entries = entryNodes(graph)
    if (entries.length === 0) return []
    const reachable = reachableFrom(graph, entries.map((node) => node.id))
    const findings: Finding[] = []
    for (const node of graph.nodes) {
      if (reachable.has(node.id)) continue
      findings.push({
        ruleId: 'structure/unreachable-node',
        severity: 'warning',
        message: `"${node.title}" cannot be reached from any trigger.`,
        nodeIds: [node.id],
        source: node.source,
      })
    }
    return findings
  },
}

export const circularFlow: Rule = {
  id: 'structure/circular-flow',
  pack: 'structure',
  description: 'Control flow must not loop back on itself.',
  evaluate(graph) {
    return findCycles(graph).map((cycle) => ({
      ruleId: 'structure/circular-flow',
      severity: 'error' as const,
      message: `Circular flow detected across ${cycle.length} blocks.`,
      nodeIds: [...cycle],
    }))
  },
}
