import { z } from 'zod'
import { findingSchema } from '../ir/index.js'
import type { Finding, Severity } from '../ir/index.js'
import type { AssessmentOutcome } from './types.js'

export const ARCHIVE_VERSION = 1
export const DEFAULT_HISTORY_LIMIT = 200

export const assessmentRecordSchema = z.object({
  id: z.string().min(1),
  skillUri: z.string().min(1),
  skillName: z.string(),
  contentHash: z.string().min(1),
  createdAt: z.string().min(1),
  model: z.object({ vendor: z.string(), family: z.string(), id: z.string() }),
  summary: z.string(),
  findings: z.array(findingSchema),
  counts: z.object({
    error: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
  }),
  durationMs: z.number().nonnegative(),
  redactions: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
})

export const assessmentArchiveSchema = z.object({
  version: z.literal(ARCHIVE_VERSION),
  records: z.array(assessmentRecordSchema),
})

export type AssessmentRecord = z.infer<typeof assessmentRecordSchema>
export type AssessmentArchive = z.infer<typeof assessmentArchiveSchema>

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const finding of findings) counts[finding.severity] += 1
  return counts
}

export interface RecordInput {
  readonly id: string
  readonly createdAt: string
  readonly skillUri: string
  readonly skillName: string
  readonly contentHash: string
  readonly durationMs: number
  readonly outcome: AssessmentOutcome
}

/** Identity and time are supplied by the host so the record stays a pure function of its input. */
export function createAssessmentRecord(input: RecordInput): AssessmentRecord {
  return {
    id: input.id,
    skillUri: input.skillUri,
    skillName: input.skillName,
    contentHash: input.contentHash,
    createdAt: input.createdAt,
    model: { ...input.outcome.model },
    summary: input.outcome.summary,
    findings: [...input.outcome.findings],
    counts: countBySeverity(input.outcome.findings),
    durationMs: input.durationMs,
    redactions: input.outcome.redactions,
    rejected: input.outcome.rejected,
  }
}

/** Newest first, one record per skill, content hash and model, capped at `limit`. */
export function pruneRecords(
  records: readonly AssessmentRecord[],
  limit = DEFAULT_HISTORY_LIMIT,
): AssessmentRecord[] {
  const seen = new Set<string>()
  const kept: AssessmentRecord[] = []
  for (const record of records) {
    const key = cacheKey(record.skillUri, record.contentHash, record.model.id)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(record)
    if (kept.length >= Math.max(1, limit)) break
  }
  return kept
}

/** A different model is a different answer, so it must not reuse another model's report. */
function cacheKey(skillUri: string, contentHash: string, modelId: string): string {
  return `${skillUri}|${contentHash}|${modelId}`
}

export function findRecord(
  records: readonly AssessmentRecord[],
  skillUri: string,
  contentHash: string,
  modelId: string,
): AssessmentRecord | undefined {
  const wanted = cacheKey(skillUri, contentHash, modelId)
  return records.find((record) => cacheKey(record.skillUri, record.contentHash, record.model.id) === wanted)
}

export function recordModelLabel(record: AssessmentRecord): string {
  return `${record.model.family} (${record.model.vendor})`
}
