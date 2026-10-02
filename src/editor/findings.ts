import type { Finding } from '../ir/index.js'

export function findingsByNode(findings: readonly Finding[]): ReadonlyMap<string, readonly Finding[]> {
  const byNode = new Map<string, Finding[]>()
  for (const finding of findings) {
    for (const nodeId of finding.nodeIds) {
      const nodeFindings = byNode.get(nodeId) ?? []
      nodeFindings.push(finding)
      byNode.set(nodeId, nodeFindings)
    }
  }
  return byNode
}