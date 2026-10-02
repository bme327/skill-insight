import { outgoing, reachableFrom } from '../../ir/index.js'
import type { Finding } from '../../ir/index.js'
import type { Rule } from '../types.js'

export const ambiguousCondition: Rule = {
  id: 'semantics/ambiguous-condition',
  pack: 'semantics',
  description: 'A condition needs a second branch, otherwise the negative case is undefined.',
  evaluate(graph) {
    const findings: Finding[] = []
    for (const node of graph.nodes) {
      if (node.kind !== 'condition') continue
      const branches = outgoing(graph, node.id).filter((edge) => edge.kind !== 'dataFlow')
      const hasAlternative = branches.some((edge) => edge.kind === 'else' || edge.kind === 'onError')
      if (hasAlternative) continue
      findings.push({
        ruleId: 'semantics/ambiguous-condition',
        severity: 'warning',
        message: `Condition "${node.title}" has no alternative branch.`,
        nodeIds: [node.id],
        source: node.source,
      })
    }
    return findings
  },
}

export const missingErrorPath: Rule = {
  id: 'resilience/missing-error-path',
  pack: 'resilience',
  description: 'Blocks that reach outside the process need a failure path.',
  evaluate(graph) {
    const findings: Finding[] = []
    for (const node of graph.nodes) {
      if (node.kind !== 'action' && node.kind !== 'toolCall') continue
      const reachesOutside = node.capabilities.some(
        (capability) =>
          capability.kind === 'tool' || capability.kind === 'process' || capability.kind === 'network',
      )
      if (!reachesOutside) continue
      const downstream = reachableFrom(graph, [node.id])
      const covered = graph.nodes.some(
        (candidate) => candidate.kind === 'errorPath' && downstream.has(candidate.id),
      )
      if (covered) continue
      findings.push({
        ruleId: 'resilience/missing-error-path',
        severity: 'warning',
        message: `"${node.title}" can fail but no error path follows it.`,
        nodeIds: [node.id],
        source: node.source,
      })
    }
    return findings
  },
}
