import type { Finding } from '../../ir/index.js'
import type { Rule } from '../types.js'

const REASON_TEXT: Record<string, string> = {
  empty: 'the reference is empty',
  'control-character': 'the reference contains control characters',
  'uri-scheme': 'the reference names a URI scheme',
  absolute: 'the reference is an absolute path',
  'escapes-root': 'the reference points outside the allowed root',
}

export const brokenReference: Rule = {
  id: 'references/broken-reference',
  pack: 'references',
  description: 'File references must resolve inside the allowed root.',
  evaluate(graph) {
    const findings: Finding[] = []
    for (const node of graph.nodes) {
      if (node.kind !== 'reference') continue
      const rejection = node.raw['rejection']
      if (typeof rejection !== 'string') continue
      findings.push({
        ruleId: 'references/broken-reference',
        severity: 'error',
        message: `Reference "${node.title}" was rejected because ${REASON_TEXT[rejection] ?? rejection}.`,
        nodeIds: [node.id],
        source: node.source,
      })
    }
    return findings
  },
}
