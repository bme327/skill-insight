import * as vscode from 'vscode'
import { assessSkill, createAssessmentRecord, recordModelLabel } from '../assessment/index.js'
import type { AssessmentRecord } from '../assessment/index.js'
import type { AssessmentStatus } from '../editor/index.js'
import type { Finding } from '../ir/index.js'
import { AssessmentArchive, contentHash } from './assessment-archive.js'
import { toDiagnostic } from './diagnostics.js'
import type { SkillDocumentService } from './document-service.js'
import { aiAssessmentEnabled, CONFIG_SECTION, createModelClient, describeModelError, modelLabel, selectAssessmentModel } from './lm-client.js'

const CONSENT_KEY = 'skillInsights.aiAssessment.acknowledged'

const NOTICE = [
  'AI Assessment sends this skill to your language model provider (GitHub Copilot by default)',
  'and consumes your allowance. Secret-shaped values are redacted before sending.',
].join(' ')

function injectionNodeIds(findings: readonly Finding[]): string[] {
  return findings.filter((finding) => finding.ruleId === 'security/prompt-injection').flatMap((finding) => finding.nodeIds)
}

interface StoredResult {
  readonly hash: string
  readonly findings: readonly Finding[]
}

/** Runs the AI pass on explicit request only, and records the result beside the rule findings. */
export class AiAssessmentService implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('skillInsights.ai')
  private readonly changed = new vscode.EventEmitter<string | undefined>()
  private readonly disposables: vscode.Disposable[] = []
  private readonly archive: AssessmentArchive
  private readonly statuses = new Map<string, AssessmentStatus>()
  private readonly results = new Map<string, StoredResult>()
  private readonly running = new Set<string>()
  private label: string | undefined

  readonly onDidChange = this.changed.event

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly documents: SkillDocumentService,
  ) {
    this.archive = new AssessmentArchive(context.globalStorageUri)
    this.disposables.push(
      vscode.lm.onDidChangeChatModels(() => void this.probe()),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.invalidate(document.uri)),
      vscode.workspace.onDidCloseTextDocument((document) => this.diagnostics.delete(document.uri)),
      vscode.workspace.onDidOpenTextDocument((document) => void this.restore(document)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(CONFIG_SECTION)) void this.probe()
      }),
    )
    void this.probe()
  }

  status(uri: string | undefined): AssessmentStatus {
    if (!aiAssessmentEnabled()) return { state: 'unavailable', message: 'AI assessment is turned off in settings.' }
    if (this.label === undefined) {
      return { state: 'unavailable', message: 'Sign in to GitHub Copilot to enable AI assessment.' }
    }
    const stored = uri === undefined ? undefined : this.statuses.get(uri)
    return stored ?? { state: 'ready', modelLabel: this.label }
  }

  findingsFor(uri: string | undefined): readonly Finding[] {
    return (uri === undefined ? undefined : this.results.get(uri)?.findings) ?? []
  }

  history(): Promise<readonly AssessmentRecord[]> {
    return Promise.resolve(this.archive.all())
  }

  async clearHistory(): Promise<void> {
    await this.archive.clear()
    this.results.clear()
    this.statuses.clear()
    this.diagnostics.clear()
    this.changed.fire(undefined)
  }

  async resetConsent(): Promise<void> {
    await this.context.globalState.update(CONSENT_KEY, false)
  }

  async run(document: vscode.TextDocument, force = false): Promise<void> {
    const uri = document.uri.toString()
    if (!aiAssessmentEnabled()) {
      void vscode.window.showInformationMessage('AI assessment is turned off in settings.')
      return
    }
    if (this.running.has(uri)) return
    const analysis = this.documents.refresh(document)
    if (analysis === undefined) {
      void vscode.window.showInformationMessage('Open a supported skill file to assess it.')
      return
    }

    const model = await selectAssessmentModel()
    if (model === undefined) {
      this.label = undefined
      this.publish(uri, { state: 'unavailable', message: 'No language model is available.' })
      return
    }
    this.label = modelLabel(model)

    const hash = await contentHash(document.getText())
    if (!force) {
      const cached = await this.archive.cached(uri, hash, model.id)
      if (cached !== undefined) {
        this.apply(document.uri, cached, 'Cached result; the skill has not changed since.')
        return
      }
    }
    if (!await this.consent()) return

    this.running.add(uri)
    this.publish(uri, { state: 'running', modelLabel: this.label })
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Assessing ${analysis.graph.name || 'skill'}…`,
          cancellable: true,
        },
        async (_progress, token) => {
          const started = Date.now()
          try {
            const outcome = await assessSkill({
              graph: analysis.graph,
              client: createModelClient(model, token),
              suspiciousNodeIds: injectionNodeIds(analysis.findings),
            })
            if (token.isCancellationRequested) {
              this.publish(uri, { state: 'ready', modelLabel: this.label, message: 'Assessment cancelled.' })
              return
            }
            if (outcome.malformed) {
              this.publish(uri, { state: 'error', modelLabel: this.label, message: 'The model did not return a usable review.' })
              return
            }
            const record = createAssessmentRecord({
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              skillUri: uri,
              skillName: analysis.graph.name,
              contentHash: hash,
              durationMs: Date.now() - started,
              outcome,
            })
            await this.archive.add(record)
            // The spans describe the content that was sent, so a concurrent edit invalidates them.
            if (await contentHash(document.getText()) !== hash) {
              this.publish(uri, {
                state: 'ready',
                modelLabel: this.label,
                message: 'The skill changed while it was assessed, so the result was discarded.',
              })
              return
            }
            this.apply(document.uri, record, note(record))
          } catch (error) {
            if (token.isCancellationRequested) {
              this.publish(uri, { state: 'ready', modelLabel: this.label })
              return
            }
            this.publish(uri, { state: 'error', modelLabel: this.label, message: describeModelError(error) })
          }
        },
      )
    } finally {
      this.running.delete(uri)
    }
  }

  dispose(): void {
    this.diagnostics.dispose()
    this.changed.dispose()
    for (const disposable of this.disposables) disposable.dispose()
  }

  private async probe(): Promise<void> {
    try {
      const model = aiAssessmentEnabled() ? await selectAssessmentModel() : undefined
      this.label = model === undefined ? undefined : modelLabel(model)
    } catch {
      this.label = undefined
    }
    this.changed.fire(undefined)
  }

  private async consent(): Promise<boolean> {
    if (this.context.globalState.get<boolean>(CONSENT_KEY, false)) return true
    const choice = await vscode.window.showInformationMessage(
      NOTICE,
      { modal: true },
      'Run assessment',
      'Do not ask again',
    )
    if (choice === undefined) return false
    if (choice === 'Do not ask again') await this.context.globalState.update(CONSENT_KEY, true)
    return true
  }

  private apply(uri: vscode.Uri, record: AssessmentRecord, message: string | undefined): void {
    const key = uri.toString()
    this.results.set(key, { hash: record.contentHash, findings: record.findings })
    this.diagnostics.set(uri, record.findings.map(toDiagnostic))
    this.publish(key, {
      state: 'ready',
      modelLabel: recordModelLabel(record),
      summary: record.summary,
      lastRunAt: record.createdAt,
      ...(message === undefined ? {} : { message }),
    })
  }

  private publish(uri: string, status: AssessmentStatus): void {
    this.statuses.set(uri, status)
    this.changed.fire(uri)
  }

  /** Reopening restores the Problems entries only while the content still matches. */
  private async restore(document: vscode.TextDocument): Promise<void> {
    const stored = this.results.get(document.uri.toString())
    if (stored === undefined) return
    if (await contentHash(document.getText()) === stored.hash) {
      this.diagnostics.set(document.uri, stored.findings.map(toDiagnostic))
      return
    }
    this.invalidate(document.uri)
  }

  private invalidate(uri: vscode.Uri): void {
    const key = uri.toString()
    if (!this.results.has(key) && !this.statuses.has(key)) return
    this.results.delete(key)
    this.statuses.delete(key)
    this.diagnostics.delete(uri)
    this.changed.fire(key)
  }
}

function note(record: AssessmentRecord): string | undefined {
  const parts: string[] = []
  if (record.redactions > 0) parts.push(`${record.redactions} secret-shaped value(s) redacted before sending.`)
  if (record.rejected > 0) parts.push(`${record.rejected} model finding(s) discarded as unanchored.`)
  return parts.length === 0 ? undefined : parts.join(' ')
}
