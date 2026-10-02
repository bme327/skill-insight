import { z } from 'zod'
import { sortFindings } from '../ir/index.js'
import type { Finding, SkillGraph } from '../ir/index.js'
import { CATEGORIES } from './prompt.js'
import type { AssessmentResult } from './types.js'

const MAX_FINDINGS = 20
const MAX_MESSAGE = 400
const MAX_SUMMARY = 2000

const responseSchema = z.object({
  summary: z.string().optional(),
  findings: z.array(z.object({
    nodeId: z.string(),
    category: z.string().optional(),
    severity: z.string().optional(),
    message: z.string(),
  })).optional(),
})

const EMPTY: AssessmentResult = { summary: '', findings: [], rejected: 0, malformed: true }

/** Model output is untrusted: strip control characters before it reaches any renderer. */
function sanitise(value: string, limit: number): string {
  // eslint-disable-next-line no-control-regex -- stripping them is the point
  const flat = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  const candidates = [fenced?.[1] ?? trimmed]
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1))
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }
  return undefined
}

function ruleIdFor(category: string | undefined): string {
  const normalised = (category ?? '').toLowerCase()
  return CATEGORIES.some((known) => known === normalised) ? `ai/${normalised}` : 'ai/general'
}

/**
 * Turns a model response into findings anchored to real nodes. Spans always come from
 * the graph, never from the model.
 */
export function parseAssessment(graph: SkillGraph, raw: string): AssessmentResult {
  const payload = extractJson(raw)
  if (payload === undefined) return EMPTY
  const parsed = responseSchema.safeParse(payload)
  if (!parsed.success) return EMPTY

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const findings: Finding[] = []
  const seen = new Set<string>()
  let rejected = 0

  for (const candidate of parsed.data.findings ?? []) {
    const node = nodes.get(candidate.nodeId)
    const message = sanitise(candidate.message, MAX_MESSAGE)
    if (node === undefined || message === '') {
      rejected += 1
      continue
    }
    if (findings.length >= MAX_FINDINGS) {
      rejected += 1
      continue
    }
    const ruleId = ruleIdFor(candidate.category)
    const key = `${ruleId}|${node.id}|${message}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push({
      ruleId,
      severity: candidate.severity?.toLowerCase() === 'info' ? 'info' : 'warning',
      message,
      nodeIds: [node.id],
      source: node.source,
      provenance: 'ai',
    })
  }

  return {
    summary: sanitise(parsed.data.summary ?? '', MAX_SUMMARY),
    findings: sortFindings(findings),
    rejected,
    malformed: false,
  }
}
