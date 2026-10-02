import type { Finding } from '../../ir/index.js'
import type { Rule } from '../types.js'

/**
 * Skill text is untrusted and may target the assistant reading it rather than the user.
 * Patterns are deliberately narrow so ordinary wording like "ignore files in .gitignore"
 * does not fire.
 */
const INJECTION = [
  /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?|directions?)\b/i,
  /\bdisregard\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?)\b/i,
  /\byou\s+are\s+now\s+(?:a|an|the)\s+\w+/i,
  /\b(?:reveal|print|repeat|output)\s+(?:your|the)\s+(?:full\s+)?system\s+prompt\b/i,
  /\boverride\s+(?:your|the)\s+(?:safety|guardrails?|restrictions?|policies)\b/i,
  /\bdo\s+not\s+(?:tell|inform|notify)\s+the\s+user\b/i,
]

export const promptInjection: Rule = {
  id: 'security/prompt-injection',
  pack: 'security',
  description: 'Skill text that tries to redirect the assistant reading it.',
  evaluate(graph) {
    const findings: Finding[] = []
    for (const node of graph.nodes) {
      const haystack = `${node.title}\n${node.detail}`
      const match = INJECTION.find((pattern) => pattern.test(haystack))
      if (match === undefined) continue
      findings.push({
        ruleId: 'security/prompt-injection',
        severity: 'error',
        message: `"${node.title}" contains language that targets the assistant reading this skill.`,
        nodeIds: [node.id],
        source: node.source,
      })
    }
    return findings
  },
}
