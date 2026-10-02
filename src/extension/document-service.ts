import * as vscode from 'vscode'
import { analyzeSkill, recognizesSkill } from './analysis.js'
import type { SkillAnalysis } from './analysis.js'
import { toDiagnostic } from './diagnostics.js'
import { isSkillPath } from './skill-files.js'

export interface AnalysisEvent {
  readonly document: vscode.TextDocument
  readonly analysis: SkillAnalysis
}

function containingRoot(document: vscode.TextDocument): string {
  const workspace = vscode.workspace.getWorkspaceFolder(document.uri)
  if (workspace !== undefined) return workspace.uri.path
  const path = document.uri.path
  return path.slice(0, Math.max(1, path.lastIndexOf('/')))
}

export class SkillDocumentService implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('skillInsights')
  private readonly changed = new vscode.EventEmitter<AnalysisEvent>()
  private readonly disposables: vscode.Disposable[] = []
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>()
  private latestEvent: AnalysisEvent | undefined

  readonly onDidAnalyze = this.changed.event

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.refresh(document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.refresh(document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.diagnostics.delete(document.uri)),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.schedule(document)),
    )
    for (const document of vscode.workspace.textDocuments) this.refresh(document)
  }

  isSkill(document: vscode.TextDocument): boolean {
    return isSkillPath(document.uri.path) && recognizesSkill({
      uri: document.uri.toString(),
      content: document.getText(),
    })
  }

  analyze(document: vscode.TextDocument): SkillAnalysis | undefined {
    if (!this.isSkill(document)) return undefined
    return analyzeSkill(
      { uri: document.uri.toString(), content: document.getText() },
      containingRoot(document),
    )
  }

  refresh(document: vscode.TextDocument): SkillAnalysis | undefined {
    const analysis = this.analyze(document)
    if (analysis === undefined) {
      this.diagnostics.delete(document.uri)
      return undefined
    }
    this.diagnostics.set(document.uri, analysis.findings.map(toDiagnostic))
    this.latestEvent = { document, analysis }
    this.changed.fire(this.latestEvent)
    return analysis
  }

  latest(): AnalysisEvent | undefined {
    return this.latestEvent
  }

  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer)
    this.pending.clear()
    this.diagnostics.dispose()
    this.changed.dispose()
    for (const disposable of this.disposables) disposable.dispose()
  }

  private schedule(document: vscode.TextDocument): void {
    if (!isSkillPath(document.uri.path)) return
    const key = document.uri.toString()
    const previous = this.pending.get(key)
    if (previous !== undefined) clearTimeout(previous)
    this.pending.set(key, setTimeout(() => {
      this.pending.delete(key)
      this.refresh(document)
    }, 150))
  }
}