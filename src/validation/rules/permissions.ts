import type { Finding } from '../../ir/index.js'
import type { Rule } from '../types.js'

const DESTRUCTIVE = [
  /\brm\s+-[a-z]*[rf]/i,
  /\brmdir\s+\/s/i,
  /\bdel\s+\/[qsf]/i,
  /\bRemove-Item\b[^|]*-Recurse/i,
  /\bgit\s+push\b[^|]*--force(?!-with-lease)/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bDROP\s+(?:TABLE|DATABASE)\b/i,
  /\bcurl\b[^|]*\|\s*(?:ba)?sh/i,
  /\bnpm\s+publish\b/i,
]

export const undeclaredTool: Rule = {
  id: 'permissions/undeclared-tool',
  pack: 'permissions',
  description: 'Every tool a block invokes must appear in the declared tool list.',
  evaluate(graph) {
    const findings: Finding[] = []
    for (const node of graph.nodes) {
      if (node.kind === 'permission') continue
      for (const capability of node.capabilities) {
        if (capability.kind !== 'tool' || capability.declared) continue
        findings.push({
          ruleId: 'permissions/undeclared-tool',
          severity: 'error',
          message: `"${node.title}" uses tool "${capability.value}", which is not declared.`,
          nodeIds: [node.id],
          source: node.source,
        })
      }
    }
    return findings
  },
}

export const destructiveAction: Rule = {
  id: 'permissions/destructive-action',
  pack: 'permissions',
  description: 'Irreversible commands are surfaced so a reviewer sees them before enabling a skill.',
  evaluate(graph) {
    const findings: Finding[] = []
    for (const node of graph.nodes) {
      for (const capability of node.capabilities) {
        if (capability.kind !== 'process') continue
        if (!DESTRUCTIVE.some((pattern) => pattern.test(capability.value))) continue
        findings.push({
          ruleId: 'permissions/destructive-action',
          severity: 'warning',
          message: `"${node.title}" runs a destructive command: ${capability.value}`,
          nodeIds: [node.id],
          source: node.source,
        })
      }
    }
    return findings
  },
}
