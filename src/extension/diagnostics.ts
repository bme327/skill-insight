import * as vscode from 'vscode'
import type { Finding, Severity, SourceSpan } from '../ir/index.js'

function diagnosticSeverity(severity: Severity): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error': return vscode.DiagnosticSeverity.Error
    case 'warning': return vscode.DiagnosticSeverity.Warning
    case 'info': return vscode.DiagnosticSeverity.Information
  }
}

function rangeOf(source: SourceSpan | undefined): vscode.Range {
  if (source === undefined) return new vscode.Range(0, 0, 0, 1)
  return new vscode.Range(
    Math.max(0, source.start.line - 1),
    Math.max(0, source.start.column - 1),
    Math.max(0, source.end.line - 1),
    Math.max(0, source.end.column - 1),
  )
}

export function toDiagnostic(finding: Finding): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    rangeOf(finding.source),
    finding.message,
    diagnosticSeverity(finding.severity),
  )
  diagnostic.code = finding.ruleId
  diagnostic.source = finding.provenance === 'ai' ? 'Skill Insights (AI)' : 'Skill Insights'
  return diagnostic
}
