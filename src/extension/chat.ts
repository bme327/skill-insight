import * as vscode from 'vscode'
import { assessSkill } from '../assessment/index.js'
import type { Finding, SkillGraph } from '../ir/index.js'
import type { SkillDocumentService } from './document-service.js'
import { aiAssessmentEnabled, createModelClient, describeModelError } from './lm-client.js'

function markdown(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s]/gu, '\\$&')
}

function activeAnalysis(documents: SkillDocumentService) {
  const document = vscode.window.activeTextEditor?.document
  return document === undefined ? undefined : documents.refresh(document)
}

function explain(graph: SkillGraph): string {
  const kinds = new Map<string, number>()
  for (const node of graph.nodes) kinds.set(node.kind, (kinds.get(node.kind) ?? 0) + 1)
  const summary = [...kinds.entries()].map(([kind, count]) => `${count} ${markdown(kind)}`).join(', ')
  const flow = graph.nodes.slice(0, 12).map((node, index) => `${index + 1}. **${markdown(node.title || node.kind)}** (${markdown(node.kind)})`).join('\n')
  return `**${markdown(graph.name || 'Untitled skill')}** contains ${graph.nodes.length} nodes and ${graph.edges.length} connections: ${summary || 'no classified nodes'}.\n\n${flow}`
}

function findingsReport(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No validation findings were reported for the active skill.'
  return findings.map((finding) => `- **${markdown(finding.severity)} · ${markdown(finding.ruleId)}**: ${markdown(finding.message)}`).join('\n')
}

function fixes(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No fixes are needed for the active skill.'
  return `${findingsReport(findings)}\n\nOpen the Skill Graph and select a finding to navigate to its source. Automatic text fixes are unavailable until a rule supplies a structured IR patch.`
}

async function review(
  graph: SkillGraph,
  ruleFindings: readonly Finding[],
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  stream.progress('Reviewing the skill…')
  try {
    const outcome = await assessSkill({
      graph,
      client: createModelClient(request.model, token),
      suspiciousNodeIds: ruleFindings
        .filter((finding) => finding.ruleId === 'security/prompt-injection')
        .flatMap((finding) => finding.nodeIds),
    })
    if (outcome.malformed) {
      stream.markdown('The model did not return a usable review. Try again, or pick a different model.')
      return
    }
    const titles = new Map(graph.nodes.map((node) => [node.id, node.title || node.kind]))
    stream.markdown(`${markdown(outcome.summary)}\n\n`)
    stream.markdown(outcome.findings.length === 0
      ? 'The review reported no semantic problems.'
      : outcome.findings
        .map((finding) => `- **${markdown(finding.ruleId)}** on _${markdown(titles.get(finding.nodeIds[0] ?? '') ?? 'unknown block')}_: ${markdown(finding.message)}`)
        .join('\n'))
    if (outcome.redactions > 0) {
      stream.markdown(`\n\n_${outcome.redactions} secret-shaped value(s) were redacted before sending._`)
    }
  } catch (error) {
    stream.markdown(markdown(describeModelError(error)))
  }
}

export function createChatParticipant(documents: SkillDocumentService): vscode.ChatParticipant {
  const participant = vscode.chat.createChatParticipant('skillInsights', async (request, _context, stream, token) => {
    const analysis = activeAnalysis(documents)
    if (analysis === undefined) {
      stream.markdown('Open a supported skill file before using this participant.')
      return
    }
    switch (request.command) {
      case 'validate': stream.markdown(findingsReport(analysis.findings)); return
      case 'fix': stream.markdown(fixes(analysis.findings)); return
      case 'skillinsights-review':
        if (!aiAssessmentEnabled()) {
          stream.markdown('AI assessment is turned off in settings.')
          return
        }
        await review(analysis.graph, analysis.findings, request, stream, token)
        return
      case 'explain':
      case undefined: stream.markdown(explain(analysis.graph)); return
      default: stream.markdown('Use `/explain`, `/validate`, `/fix`, or `/skillinsights-review`.')
    }
  })
  participant.iconPath = new vscode.ThemeIcon('symbol-structure')
  return participant
}