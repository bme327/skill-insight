import * as vscode from 'vscode'
import {
  ARCHIVE_VERSION,
  assessmentArchiveSchema,
  DEFAULT_HISTORY_LIMIT,
  findRecord,
  pruneRecords,
} from '../assessment/index.js'
import type { AssessmentRecord } from '../assessment/index.js'
import { CONFIG_SECTION } from './lm-client.js'

const FILE_NAME = 'assessments.json'

function historyLimit(): number {
  const configured = vscode.workspace.getConfiguration().get<number>(`${CONFIG_SECTION}.historyLimit`, DEFAULT_HISTORY_LIMIT)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_HISTORY_LIMIT
}

export async function contentHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The local assessment store. A damaged file is discarded, never a reason to fail. */
export class AssessmentArchive {
  private records: AssessmentRecord[] | undefined
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly folder: vscode.Uri) {}

  async all(): Promise<readonly AssessmentRecord[]> {
    if (this.records === undefined) this.records = await this.read()
    return this.records
  }

  async cached(skillUri: string, hash: string, modelId: string): Promise<AssessmentRecord | undefined> {
    return findRecord(await this.all(), skillUri, hash, modelId)
  }

  /** Read, merge, prune and write run as one transaction so parallel adds cannot clobber. */
  async add(record: AssessmentRecord): Promise<void> {
    await this.transact(async () => {
      const existing = this.records ?? await this.read()
      this.records = pruneRecords([record, ...existing], historyLimit())
    })
  }

  async clear(): Promise<void> {
    await this.transact(() => {
      this.records = []
      return Promise.resolve()
    })
  }

  private file(): vscode.Uri {
    return vscode.Uri.joinPath(this.folder, FILE_NAME)
  }

  private async transact(mutate: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(async () => {
      await mutate()
      await this.write()
    })
    await this.queue
  }

  private async read(): Promise<AssessmentRecord[]> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.file())
      const parsed = assessmentArchiveSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
      return parsed.success ? [...parsed.data.records] : []
    } catch {
      return []
    }
  }

  private async write(): Promise<void> {
    const snapshot = { version: ARCHIVE_VERSION, records: this.records ?? [] }
    try {
      await vscode.workspace.fs.createDirectory(this.folder)
      await vscode.workspace.fs.writeFile(
        this.file(),
        new TextEncoder().encode(JSON.stringify(snapshot, null, 2)),
      )
    } catch {
      // A read-only or full storage location must not break the assessment itself.
    }
  }
}
