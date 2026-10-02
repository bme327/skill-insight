import * as vscode from 'vscode'
import { z } from 'zod'
import type { SkillCatalogGroup, SkillCatalogRecord } from '../editor/index.js'
import { groupCatalog } from '../editor/index.js'
import { recognizesSkill, summarizeSkill } from './analysis.js'
import { INCLUDE_PERSONAL_SKILLS_SETTING, includesPersonalSkills } from './discovery-policy.js'
import { isSkillPath } from './skill-files.js'

const SKILL_GLOB = '**/{SKILL.md,copilot-instructions.md,*.instructions.md,*.prompt.md,*.agent.md}'
const EXCLUDE_GLOB = '**/{node_modules,.git,dist,out,coverage}/**'
const MAX_FILES = 2_000
const MAX_FILE_BYTES = 1_000_000
const MAX_DEPTH = 12
const configuredLocationsSchema = z.array(z.string().min(1)).max(20)

interface DiscoveryRoot {
  readonly id: string
  readonly label: string
  readonly kind: 'workspace' | 'personal'
  readonly uri: vscode.Uri
  readonly workspace?: vscode.WorkspaceFolder
}

export interface ScanStatus {
  readonly scanning: boolean
  readonly scanned: number
  readonly total: number
}

const IDLE_STATUS: ScanStatus = { scanning: false, scanned: 0, total: 0 }
const PROGRESS_STRIDE = 25
const READ_CONCURRENCY = 24

// Results stay in input order so the dedupe below is deterministic.
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      const item = items[index]
      if (item === undefined) continue
      results[index] = await worker(item)
    }
  })
  await Promise.all(runners)
  return results
}

function environment(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined
  const value = process.env[name]
  return value === undefined || value.length === 0 ? undefined : value
}

function personalRoots(): DiscoveryRoot[] {
  const includePersonal = includesPersonalSkills(
    vscode.workspace.getConfiguration('skillInsights').get('includePersonalSkills', true),
  )
  if (!includePersonal) return []

  const roots: DiscoveryRoot[] = []
  const home = environment('USERPROFILE') ?? environment('HOME')
  if (home !== undefined) {
    roots.push(
      { id: 'personal:agents', label: 'Personal · Agent skills', kind: 'personal', uri: vscode.Uri.file(`${home}/.agents/skills`) },
      { id: 'personal:copilot', label: 'Personal · Copilot', kind: 'personal', uri: vscode.Uri.file(`${home}/.copilot`) },
    )
  }
  const appData = environment('APPDATA')
  if (appData !== undefined) {
    roots.push({
      id: 'personal:prompts',
      label: 'Personal · VS Code prompts',
      kind: 'personal',
      uri: vscode.Uri.file(`${appData}/Code/User/prompts`),
    })
  } else {
    roots.push({
      id: 'personal:prompts',
      label: 'Personal · VS Code prompts',
      kind: 'personal',
      uri: vscode.Uri.from({ scheme: 'vscode-userdata', path: '/User/prompts' }),
    })
  }

  const configured = configuredLocationsSchema.safeParse(
    vscode.workspace.getConfiguration('skillInsights').get('personalSkillLocations', []),
  )
  if (configured.success) {
    configured.data.forEach((value, index) => {
      const isWindowsPath = /^[a-z]:[\\/]/i.test(value)
      const uri = isWindowsPath || !/^[a-z][a-z0-9+.-]*:/i.test(value)
        ? vscode.Uri.file(value)
        : vscode.Uri.parse(value)
      roots.push({
        id: `personal:configured:${index}`,
        label: `Personal · ${uri.path.split('/').filter(Boolean).pop() ?? 'Configured'}`,
        kind: 'personal',
        uri,
      })
    })
  }
  return roots
}

function workspaceRoot(folder: vscode.WorkspaceFolder, uri: vscode.Uri): DiscoveryRoot {
  const relative = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')
  const topLevel = relative.split('/')[0]
  const location = topLevel === '.github' || topLevel === '.copilot' || topLevel === '.agents'
    ? topLevel
    : 'Workspace'
  return {
    id: `workspace:${folder.uri.toString()}:${location}`,
    label: `${folder.name} · ${location}`,
    kind: 'workspace',
    uri: folder.uri,
    workspace: folder,
  }
}

function openDocumentRoot(uri: vscode.Uri): DiscoveryRoot {
  const lastSeparator = uri.path.lastIndexOf('/')
  const parentPath = lastSeparator > 0 ? uri.path.slice(0, lastSeparator) : '/'
  const parent = uri.with({ path: parentPath, query: '', fragment: '' })
  const folderName = parent.path.split('/').filter(Boolean).pop() ?? 'External'
  return {
    id: `open:${parent.toString()}`,
    label: `Open files · ${folderName}`,
    kind: 'workspace',
    uri: parent,
  }
}

function relativePath(root: vscode.Uri, uri: vscode.Uri): string {
  const base = root.path.endsWith('/') ? root.path : `${root.path}/`
  return uri.path.startsWith(base) ? uri.path.slice(base.length) : uri.path.split('/').pop() ?? uri.path
}

async function readSkill(uri: vscode.Uri): Promise<string | undefined> {
  const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString())
  if (open !== undefined) {
    const content = open.getText()
    return content.length > MAX_FILE_BYTES ? undefined : content
  }
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    if (stat.size > MAX_FILE_BYTES) return undefined
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
  } catch {
    return undefined
  }
}

async function personalFiles(root: vscode.Uri): Promise<vscode.Uri[]> {
  const files: vscode.Uri[] = []
  const queue: Array<{ uri: vscode.Uri; depth: number }> = [{ uri: root, depth: 0 }]
  while (queue.length > 0 && files.length < MAX_FILES) {
    const current = queue.shift()
    if (current === undefined) break
    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(current.uri)
    } catch {
      continue
    }
    for (const [name, type] of entries) {
      if ((type & vscode.FileType.SymbolicLink) !== 0) continue
      const uri = vscode.Uri.joinPath(current.uri, name)
      if ((type & vscode.FileType.Directory) !== 0 && current.depth < MAX_DEPTH) {
        queue.push({ uri, depth: current.depth + 1 })
      } else if ((type & vscode.FileType.File) !== 0 && isSkillPath(uri.path)) {
        files.push(uri)
      }
      if (files.length >= MAX_FILES) break
    }
  }
  return files
}

export class SkillDiscoveryService implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<readonly SkillCatalogGroup[]>()
  private readonly statusChanged = new vscode.EventEmitter<ScanStatus>()
  private readonly disposables: vscode.Disposable[] = []
  private readonly watcher = vscode.workspace.createFileSystemWatcher(SKILL_GLOB)
  private readonly personalWatcherDisposables: vscode.Disposable[] = []
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private groupsValue: readonly SkillCatalogGroup[] = []
  private refreshRevision = 0
  private statusValue: ScanStatus = IDLE_STATUS

  readonly onDidChange = this.changed.event
  readonly onDidChangeStatus = this.statusChanged.event

  constructor() {
    this.disposables.push(
      this.watcher,
      this.watcher.onDidCreate(() => this.schedule()),
      this.watcher.onDidChange(() => this.schedule()),
      this.watcher.onDidDelete(() => this.schedule()),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (isSkillPath(document.uri.path)) this.schedule()
      }),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        if (isSkillPath(document.uri.path)) this.schedule()
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (isSkillPath(document.uri.path)) this.schedule()
      }),
      vscode.workspace.onDidCreateFiles(() => this.schedule()),
      vscode.workspace.onDidDeleteFiles(() => this.schedule()),
      vscode.workspace.onDidRenameFiles(() => this.schedule()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration(INCLUDE_PERSONAL_SKILLS_SETTING)
          || event.affectsConfiguration('skillInsights.personalSkillLocations')
        ) {
          this.resetPersonalWatchers()
          void this.refresh()
        }
      }),
    )
    this.resetPersonalWatchers()
    void this.refresh()
  }

  groups(): readonly SkillCatalogGroup[] {
    return this.groupsValue
  }

  scanning(): boolean {
    return this.statusValue.scanning
  }

  status(): ScanStatus {
    return this.statusValue
  }

  has(uri: vscode.Uri): boolean {
    const key = uri.toString()
    return this.groupsValue.some((group) => group.skills.some((skill) => skill.uri === key))
  }

  async refresh(): Promise<void> {
    const revision = ++this.refreshRevision
    this.setStatus({ scanning: true, scanned: 0, total: 0 })
    try {
      await vscode.window.withProgress(
        { location: { viewId: 'skillInsights.skillCatalog' } },
        () => this.scan(revision),
      )
    } finally {
      if (revision === this.refreshRevision) this.setStatus(IDLE_STATUS)
    }
  }

  private setStatus(value: ScanStatus): void {
    this.statusValue = value
    this.statusChanged.fire(value)
  }

  private async scan(revision: number): Promise<void> {
    const foundWorkspaceFiles = await vscode.workspace.findFiles(SKILL_GLOB, EXCLUDE_GLOB, MAX_FILES)
    if (revision !== this.refreshRevision) return

    const workspaceFiles = new Map<string, vscode.Uri>()
    for (const document of vscode.workspace.textDocuments) {
      if (isSkillPath(document.uri.path)) {
        workspaceFiles.set(document.uri.toString(), document.uri)
      }
    }
    for (const uri of foundWorkspaceFiles) workspaceFiles.set(uri.toString(), uri)
    const personal = personalRoots()
    const personalResults = await Promise.all(personal.map(async (root) => ({
      root,
      files: await personalFiles(root.uri),
    })))
    if (revision !== this.refreshRevision) return

    const tasks: Array<{ root: DiscoveryRoot; uri: vscode.Uri }> = []
    for (const uri of workspaceFiles.values()) {
      const folder = vscode.workspace.getWorkspaceFolder(uri)
      tasks.push({ root: folder === undefined ? openDocumentRoot(uri) : workspaceRoot(folder, uri), uri })
    }
    for (const result of personalResults) {
      for (const uri of result.files) tasks.push({ root: result.root, uri })
    }

    const total = tasks.length
    let scanned = 0
    const advance = (): void => {
      scanned += 1
      if (revision === this.refreshRevision && scanned % PROGRESS_STRIDE === 0) {
        this.setStatus({ scanning: true, scanned, total })
      }
    }
    this.setStatus({ scanning: true, scanned, total })

    const records = await mapLimit(tasks, READ_CONCURRENCY, async (task) => {
      const record = await this.record(task.root, task.uri)
      advance()
      return record
    })

    const unique = new Map<string, SkillCatalogRecord>()
    for (const record of records) {
      if (record !== undefined && !unique.has(record.skill.uri)) unique.set(record.skill.uri, record)
    }
    if (revision !== this.refreshRevision) return
    this.groupsValue = groupCatalog([...unique.values()])
    this.changed.fire(this.groupsValue)
    void vscode.commands.executeCommand(
      'setContext',
      'skillInsights.skillResourceNames',
      [...new Set(this.groupsValue.flatMap((group) => group.skills.map((skill) =>
        vscode.Uri.parse(skill.uri).path.split('/').pop() ?? '',
      )))],
    )
  }

  dispose(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer)
    this.changed.dispose()
    this.statusChanged.dispose()
    for (const disposable of this.personalWatcherDisposables) disposable.dispose()
    for (const disposable of this.disposables) disposable.dispose()
  }

  private schedule(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      void this.refresh()
    }, 750)
  }

  private resetPersonalWatchers(): void {
    for (const disposable of this.personalWatcherDisposables.splice(0)) disposable.dispose()
    for (const root of personalRoots()) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root.uri, SKILL_GLOB))
      this.personalWatcherDisposables.push(
        watcher,
        watcher.onDidCreate(() => this.schedule()),
        watcher.onDidChange(() => this.schedule()),
        watcher.onDidDelete(() => this.schedule()),
      )
    }
  }

  private async record(root: DiscoveryRoot, uri: vscode.Uri): Promise<SkillCatalogRecord | undefined> {
    const content = await readSkill(uri)
    if (content === undefined) return undefined
    const file = { uri: uri.toString(), content }
    if (!recognizesSkill(file)) return undefined
    const graph = summarizeSkill(file, root.uri.path)
    return {
      groupId: root.id,
      groupLabel: root.label,
      kind: root.kind,
      skill: {
        uri: uri.toString(),
        name: graph.name || uri.path.split('/').pop() || 'Untitled skill',
        description: graph.description,
        path: root.workspace === undefined
          ? relativePath(root.uri, uri)
          : vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'),
      },
    }
  }
}