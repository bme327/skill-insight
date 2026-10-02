import * as vscode from 'vscode'
import type { HostMessage, SkillCatalogGroup } from '../editor/index.js'
import { webviewMessageSchema } from '../editor/index.js'
import type { CatalogFilterStore } from './catalog-filter.js'
import type { SkillDiscoveryService } from './discovery.js'

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

function html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const token = nonce()
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'catalog.js'))
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'catalog.css'))
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${token}';">
  <link rel="stylesheet" href="${style}">
  <title>Skills</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${token}" src="${script}"></script>
</body>
</html>`
}

export class SkillCatalogViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'skillInsights.skillCatalog'

  private readonly disposables: vscode.Disposable[] = []
  private readonly viewDisposables: vscode.Disposable[] = []
  private view: vscode.WebviewView | undefined
  private selectedUri: string | undefined

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly discovery: SkillDiscoveryService,
    private readonly filters: CatalogFilterStore,
    private readonly onSelect: (uri: vscode.Uri) => void,
  ) {
    this.disposables.push(
      discovery.onDidChange((groups) => this.post(catalogMessage(groups, this.selectedUri))),
      discovery.onDidChangeStatus((status) => this.post({
        type: 'status',
        scanning: status.scanning,
        scanned: status.scanned,
        total: status.total,
      })),
      filters.onDidChange((change) => {
        if (change.origin !== 'sidebar') this.post({ type: 'filter', value: change.value })
      }),
    )
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    }
    view.webview.html = html(view.webview, this.extensionUri)
    this.viewDisposables.push(
      view.webview.onDidReceiveMessage((message: unknown) => this.receive(message)),
      view.onDidDispose(() => {
        for (const disposable of this.viewDisposables.splice(0)) disposable.dispose()
        this.view = undefined
      }),
    )
  }

  setSelected(uri: string | undefined): void {
    this.selectedUri = uri
    this.post(catalogMessage(this.discovery.groups(), uri))
  }

  dispose(): void {
    for (const disposable of this.viewDisposables.splice(0)) disposable.dispose()
    for (const disposable of this.disposables) disposable.dispose()
  }

  private post(message: HostMessage): void {
    void this.view?.webview.postMessage(message)
  }

  private receive(message: unknown): void {
    const parsed = webviewMessageSchema.safeParse(message)
    if (!parsed.success) return
    if (parsed.data.type === 'ready') {
      const status = this.discovery.status()
      this.post(catalogMessage(this.discovery.groups(), this.selectedUri))
      this.post({ type: 'status', scanning: status.scanning, scanned: status.scanned, total: status.total })
      this.post({ type: 'filter', value: this.filters.value() })
      return
    }
    if (parsed.data.type === 'setFilter') {
      this.filters.set(parsed.data.value, 'sidebar')
      return
    }
    if (parsed.data.type === 'selectSkill' && this.discovery.has(vscode.Uri.parse(parsed.data.uri))) {
      this.onSelect(vscode.Uri.parse(parsed.data.uri))
    }
  }
}
