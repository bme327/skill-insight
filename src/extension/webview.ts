import * as vscode from 'vscode'
import type { HostMessage, SkillCatalogGroup } from '../editor/index.js'
import { webviewMessageSchema } from '../editor/index.js'
import type { SourceSpan } from '../ir/index.js'
import { sortFindings } from '../ir/index.js'
import type { AiAssessmentService } from './ai-assessment.js'
import type { SkillAnalysis } from './analysis.js'
import type { CatalogFilterStore } from './catalog-filter.js'
import type { SkillDiscoveryService } from './discovery.js'
import type { SkillDocumentService } from './document-service.js'

function nonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function catalogMessage(
  groups: readonly SkillCatalogGroup[],
  selectedUri: string | undefined,
): HostMessage {
  return selectedUri === undefined
    ? { type: 'catalog', groups: [...groups] }
    : { type: 'catalog', groups: [...groups], selectedUri }
}

function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const token = nonce()
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'))
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.css'))
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${token}';">
  <link rel="stylesheet" href="${style}">
  <title>Skill Graph</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${token}" src="${script}"></script>
</body>
</html>`
}

function configure(webview: vscode.Webview, extensionUri: vscode.Uri): void {
  webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
  }
  webview.html = webviewHtml(webview, extensionUri)
}

export class SkillGraphPanelController implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private readonly panelDisposables: vscode.Disposable[] = []
  private readonly selectionChanged = new vscode.EventEmitter<string | undefined>()
  private panel: vscode.WebviewPanel | undefined
  private selectedUri: string | undefined
  private sourceColumn: vscode.ViewColumn = vscode.ViewColumn.One
  private ready = false

  readonly onDidChangeSelection = this.selectionChanged.event

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly documents: SkillDocumentService,
    private readonly discovery: SkillDiscoveryService,
    private readonly filters: CatalogFilterStore,
    private readonly assessment: AiAssessmentService,
  ) {
    this.disposables.push(
      documents.onDidAnalyze((event) => {
        const uri = event.document.uri.toString()
        if (uri === this.selectedUri) this.sendAnalysis(uri, event.analysis)
      }),
      assessment.onDidChange((uri) => {
        if (this.selectedUri === undefined) return
        if (uri !== undefined && uri !== this.selectedUri) return
        this.sendAssessment(this.selectedUri)
        const latest = this.documents.latest()
        if (latest?.document.uri.toString() === this.selectedUri) {
          this.sendAnalysis(this.selectedUri, latest.analysis)
        }
      }),
      filters.onDidChange((change) => {
        if (change.origin !== 'panel') this.send({ type: 'filter', value: change.value })
      }),
      discovery.onDidChangeStatus((status) => {
        this.send({ type: 'status', scanning: status.scanning, scanned: status.scanned, total: status.total })
      }),
      discovery.onDidChange((groups) => {
        this.send(catalogMessage(groups, this.selectedUri))
        if (this.selectedUri !== undefined && !discovery.has(vscode.Uri.parse(this.selectedUri))) {
          const fallback = groups[0]?.skills[0]
          if (fallback === undefined) {
            this.selectedUri = undefined
            this.selectionChanged.fire(undefined)
            this.send({ type: 'empty', message: 'No conforming skill files found.' })
          } else {
            void this.select(vscode.Uri.parse(fallback.uri))
          }
        }
      }),
    )
  }

  async open(resource?: vscode.Uri): Promise<void> {
    const active = vscode.window.activeTextEditor?.document
    const target = resource
      ?? (active !== undefined && this.documents.isSkill(active) ? active.uri : undefined)
      ?? this.firstSkill()
    if (target === undefined) {
      void vscode.window.showInformationMessage('No conforming skill files were found.')
      return
    }

    if (this.panel === undefined) {
      this.sourceColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
      const valid = await this.select(target)
      if (!valid) return
      this.panel = vscode.window.createWebviewPanel(
        'skillInsights.graphPanel',
        'Skill Graph',
        vscode.ViewColumn.Beside,
        { enableFindWidget: true, retainContextWhenHidden: true },
      )
      configure(this.panel.webview, this.extensionUri)
      this.ready = false
      this.panelDisposables.push(
        this.panel.webview.onDidReceiveMessage((message: unknown) => this.receive(message)),
        this.panel.onDidDispose(() => {
          for (const disposable of this.panelDisposables.splice(0)) disposable.dispose()
          this.panel = undefined
          this.ready = false
        }),
      )
      return
    }

    await this.select(target)
    this.panel.reveal(this.panel.viewColumn, false)
  }

  dispose(): void {
    this.panel?.dispose()
    this.selectionChanged.dispose()
    for (const disposable of this.panelDisposables.splice(0)) disposable.dispose()
    for (const disposable of this.disposables) disposable.dispose()
  }

  private firstSkill(): vscode.Uri | undefined {
    const skill = this.discovery.groups()[0]?.skills[0]
    return skill === undefined ? undefined : vscode.Uri.parse(skill.uri)
  }

  private async select(
    uri: vscode.Uri,
  ): Promise<boolean> {
    let document: vscode.TextDocument
    try {
      document = await vscode.workspace.openTextDocument(uri)
    } catch {
      void vscode.window.showWarningMessage(`Could not open ${uri.toString()}.`)
      return false
    }
    const analysis = this.documents.refresh(document)
    if (analysis === undefined) {
      void vscode.window.showInformationMessage('The selected file does not have a conforming skill header.')
      return false
    }

    this.selectedUri = uri.toString()
    this.selectionChanged.fire(this.selectedUri)
    if (this.panel !== undefined) this.panel.title = `Skill Graph: ${analysis.graph.name || 'Untitled'}`
    this.send(catalogMessage(this.discovery.groups(), this.selectedUri))
    this.sendAnalysis(this.selectedUri, analysis)
    return true
  }

  private sendAnalysis(uri: string, analysis: SkillAnalysis): void {
    this.send({
      type: 'analysis',
      graph: analysis.graph,
      findings: sortFindings([...analysis.findings, ...this.assessment.findingsFor(uri)]),
    })
    this.sendAssessment(uri)
  }

  private sendAssessment(uri: string): void {
    this.send({ type: 'assessment', ...this.assessment.status(uri) })
  }

  private receive(message: unknown): void {
    const parsed = webviewMessageSchema.safeParse(message)
    if (!parsed.success) return
    switch (parsed.data.type) {
      case 'ready':
        this.ready = true
        this.send(catalogMessage(this.discovery.groups(), this.selectedUri))
        this.send({
          type: 'status',
          scanning: this.discovery.status().scanning,
          scanned: this.discovery.status().scanned,
          total: this.discovery.status().total,
        })
        if (this.selectedUri !== undefined) void this.select(vscode.Uri.parse(this.selectedUri))
        this.send({ type: 'filter', value: this.filters.value() })
        return
      case 'setFilter':
        this.filters.set(parsed.data.value, 'panel')
        return
      case 'selectSkill':
        if (this.discovery.has(vscode.Uri.parse(parsed.data.uri))) {
          void this.select(vscode.Uri.parse(parsed.data.uri))
        }
        return
      case 'runAssessment': {
        const force = parsed.data.force ?? false
        if (this.selectedUri !== undefined) void this.assess(this.selectedUri, force)
        return
      }
      case 'revealSource':
        if (parsed.data.source.uri === this.selectedUri) void this.revealSource(parsed.data.source)
    }
  }

  private async assess(uri: string, force: boolean): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri))
    await this.assessment.run(document, force)
  }

  private async revealSource(source: SourceSpan): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(source.uri))
    const requested = new vscode.Range(
      source.start.line - 1,
      source.start.column - 1,
      source.end.line - 1,
      source.end.column - 1,
    )
    const range = document.validateRange(requested)
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: this.sourceColumn,
      preserveFocus: false,
      preview: false,
      selection: range,
    })
    editor.selection = new vscode.Selection(range.end, range.start)
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
  }

  private send(message: HostMessage): void {
    if (this.ready) void this.panel?.webview.postMessage(message)
  }
}