import { z } from 'zod'
import { sourceSpanSchema } from './schema.js'

export const severitySchema = z.enum(['error', 'warning', 'info'])

/** Absent means `rule`; only a non-deterministic source has to announce itself. */
export const provenanceSchema = z.enum(['rule', 'ai'])

export const findingSchema = z.object({
  ruleId: z.string().min(1),
  severity: severitySchema,
  message: z.string().min(1),
  nodeIds: z.array(z.string()),
  source: sourceSpanSchema.optional(),
  provenance: provenanceSchema.optional(),
})

export type Severity = z.infer<typeof severitySchema>
export type Provenance = z.infer<typeof provenanceSchema>
export type Finding = z.infer<typeof findingSchema>

const severityRank: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/** Deterministic order so snapshots, CI output, and diffs stay stable. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = severityRank[a.severity] - severityRank[b.severity]
    if (bySeverity !== 0) return bySeverity
    const byRule = a.ruleId.localeCompare(b.ruleId)
    if (byRule !== 0) return byRule
    const byNode = (a.nodeIds[0] ?? '').localeCompare(b.nodeIds[0] ?? '')
    if (byNode !== 0) return byNode
    return a.message.localeCompare(b.message)
  })
}

export function hasSeverity(findings: readonly Finding[], severity: Severity): boolean {
  return findings.some((finding) => finding.severity === severity)
}
