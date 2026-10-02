import type { SkillGraph, SkillNode } from '../ir/index.js'

/** Key names whose assigned value is treated as a secret regardless of shape. */
const SECRET_KEY = '(?:api[_-]?key|apikey|secret|client[_-]?secret|password|passwd|pwd|token|access[_-]?key)'

const PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/gi,
  new RegExp(`\\b${SECRET_KEY}\\b\\s*[:=]\\s*["']?[A-Za-z0-9_\\-./+]{12,}["']?`, 'gi'),
]

export const REDACTED = '[redacted]'

export interface RedactedGraph {
  readonly graph: SkillGraph
  readonly redactions: number
}

function scrub(text: string, count: { value: number }): string {
  let result = text
  for (const pattern of PATTERNS) {
    result = result.replace(pattern, (match) => {
      count.value += 1
      const key = /^[A-Za-z][\w-]*(?=\s*[:=])/.exec(match)
      return key === null ? REDACTED : `${key[0]}: ${REDACTED}`
    })
  }
  return result
}

function scrubNode(node: SkillNode, count: { value: number }): SkillNode {
  return {
    ...node,
    title: scrub(node.title, count),
    detail: scrub(node.detail, count),
    capabilities: node.capabilities.map((capability) => ({
      ...capability,
      value: scrub(capability.value, count),
    })),
  }
}

/**
 * Removes credential-shaped text before a graph is described to a model.
 * Every field `buildAssessmentPrompt` sends must be scrubbed here.
 */
export function redactSecrets(graph: SkillGraph): RedactedGraph {
  const count = { value: 0 }
  const redacted: SkillGraph = {
    ...graph,
    name: scrub(graph.name, count),
    description: scrub(graph.description, count),
    declaredTools: graph.declaredTools.map((tool) => scrub(tool, count)),
    nodes: graph.nodes.map((node) => scrubNode(node, count)),
  }
  return { graph: redacted, redactions: count.value }
}
