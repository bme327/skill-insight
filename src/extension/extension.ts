import * as vscode from 'vscode'
import { AiAssessmentService } from './ai-assessment.js'
import { CatalogFilterStore } from './catalog-filter.js'
import { SkillCatalogViewProvider } from './catalog-webview.js'
import { createChatParticipant } from './chat.js'
import { SkillDiscoveryService } from './discovery.js'
import { SkillDocumentService } from './document-service.js'
import { SkillGraphPanelController } from './webview.js'

export function activate(context: vscode.ExtensionContext): void {
  const documents = new SkillDocumentService()
  const discovery = new SkillDiscoveryService()
  const filters = new CatalogFilterStore()
  const assessment = new AiAssessmentService(context, documents)
  const graph = new SkillGraphPanelController(context.extensionUri, documents, discovery, filters, assessment)
  const catalog = new SkillCatalogViewProvider(
    context.extensionUri,
    discovery,
    filters,
    (uri) => void graph.open(uri),
  )

  const updateActiveContext = (): void => {
    const document = vscode.window.activeTextEditor?.document
    void vscode.commands.executeCommand(
      'setContext',
      'skillInsights.activeEditorIsSkill',
      document !== undefined && documents.isSkill(document),
    )
  }

  context.subscriptions.push(
    documents,
    discovery,
    filters,
    assessment,
    graph,
    catalog,
    vscode.window.registerWebviewViewProvider(SkillCatalogViewProvider.viewType, catalog),
    graph.onDidChangeSelection((uri) => catalog.setSelected(uri)),
    vscode.commands.registerCommand('skillInsights.openGraph', (resource: unknown) => {
      void graph.open(resource instanceof vscode.Uri ? resource : undefined)
    }),
    vscode.commands.registerCommand('skillInsights.refreshSkills', () => discovery.refresh()),
    vscode.window.onDidChangeActiveTextEditor(updateActiveContext),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      if (document.uri.toString() === vscode.window.activeTextEditor?.document.uri.toString()) {
        updateActiveContext()
      }
    }),
    vscode.commands.registerCommand('skillInsights.validate', () => {
      const document = vscode.window.activeTextEditor?.document
      const analysis = document === undefined ? undefined : documents.refresh(document)
      if (analysis === undefined) {
        void vscode.window.showInformationMessage('Open a supported skill file to validate it.')
        return
      }
      void vscode.window.showInformationMessage(
        analysis.findings.length === 0
          ? 'Skill Insights found no issues.'
          : `Skill Insights reported ${analysis.findings.length} finding(s).`,
      )
    }),
    vscode.commands.registerCommand('skillInsights.aiAssessment', () => {
      const document = vscode.window.activeTextEditor?.document
      if (document === undefined) {
        void vscode.window.showInformationMessage('Open a supported skill file to assess it.')
        return
      }
      void assessment.run(document)
    }),
    vscode.commands.registerCommand('skillInsights.showAssessmentHistory', () => {
      void (async () => {
        const records = await assessment.history()
        const document = await vscode.workspace.openTextDocument({
          language: 'json',
          content: JSON.stringify(records, null, 2),
        })
        await vscode.window.showTextDocument(document, { preview: true })
      })()
    }),
    vscode.commands.registerCommand('skillInsights.clearAssessmentHistory', () => {
      void (async () => {
        await assessment.clearHistory()
        void vscode.window.showInformationMessage('AI assessment history cleared.')
      })()
    }),
    vscode.commands.registerCommand('skillInsights.resetAssessmentConsent', () => {
      void (async () => {
        await assessment.resetConsent()
        void vscode.window.showInformationMessage('AI assessment will ask for confirmation again.')
      })()
    }),
    createChatParticipant(documents),
  )

  updateActiveContext()
}