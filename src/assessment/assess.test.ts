import { describe, expect, it } from 'vitest'
import { testGraph, testNode } from '../testing/graph-builder.js'
import { assessSkill } from './assess.js'
import {
  assessmentArchiveSchema,
  ARCHIVE_VERSION,
  createAssessmentRecord,
  findRecord,
  pruneRecords,
  recordModelLabel,
} from './record.js'
import type { AssessmentRecord } from './record.js'
import type { AssessmentPrompt, ModelClient } from './types.js'

const identity = { vendor: 'copilot', family: 'gpt-4o', id: 'copilot-gpt-4o' }

function clientReturning(raw: string, capture?: (prompt: AssessmentPrompt) => void): ModelClient {
  return {
    identity,
    complete: async (prompt) => {
      capture?.(prompt)
      return raw
    },
  }
}

function record(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    id: 'r1',
    skillUri: 'file:///skill.md',
    skillName: 'skill',
    contentHash: 'hash-a',
    createdAt: '2026-01-01T00:00:00.000Z',
    model: identity,
    summary: '',
    findings: [],
    counts: { error: 0, warning: 0, info: 0 },
    durationMs: 1,
    redactions: 0,
    rejected: 0,
    ...overrides,
  }
}

describe('assessSkill', () => {
  it('sends redacted content but anchors findings to the original graph', async () => {
    const graph = testGraph([
      testNode('n1', 'action', { detail: 'use token: sk_live_7Hn2Qp91ZzLm44xR to publish' }),
    ])
    let sent: AssessmentPrompt | undefined
    const client = clientReturning(
      JSON.stringify({ summary: 'ok', findings: [{ nodeId: 'n1', message: 'Unclear.' }] }),
      (prompt) => { sent = prompt },
    )

    const outcome = await assessSkill({ graph, client })

    expect(sent?.skillData).not.toContain('sk_live_7Hn2Qp91ZzLm44xR')
    expect(outcome.redactions).toBe(1)
    expect(outcome.model).toEqual(identity)
    expect(outcome.findings[0]?.source).toEqual(graph.nodes[0]?.source)
  })

  it('surfaces a malformed response rather than throwing', async () => {
    const outcome = await assessSkill({ graph: testGraph([testNode('n1', 'action')]), client: clientReturning('nope') })

    expect(outcome.malformed).toBe(true)
    expect(outcome.findings).toEqual([])
  })
})

describe('assessment records', () => {
  it('counts findings by severity', () => {
    const created = createAssessmentRecord({
      id: 'r1',
      createdAt: '2026-01-01T00:00:00.000Z',
      skillUri: 'file:///skill.md',
      skillName: 'skill',
      contentHash: 'hash-a',
      durationMs: 42,
      outcome: {
        summary: 'fine',
        malformed: false,
        rejected: 1,
        redactions: 2,
        model: identity,
        findings: [
          { ruleId: 'ai/clarity', severity: 'warning', message: 'a', nodeIds: ['n1'], provenance: 'ai' },
          { ruleId: 'ai/safety', severity: 'info', message: 'b', nodeIds: ['n1'], provenance: 'ai' },
        ],
      },
    })

    expect(created.counts).toEqual({ error: 0, warning: 1, info: 1 })
    expect(created.durationMs).toBe(42)
  })

  it('round-trips through the archive schema', () => {
    const archive = { version: ARCHIVE_VERSION, records: [record()] }

    expect(assessmentArchiveSchema.parse(archive)).toEqual(archive)
  })

  it('keeps the newest record per skill, content hash and model', () => {
    const pruned = pruneRecords([
      record({ id: 'new', contentHash: 'hash-a' }),
      record({ id: 'old', contentHash: 'hash-a' }),
      record({ id: 'other-model', contentHash: 'hash-a', model: { ...identity, id: 'claude' } }),
      record({ id: 'other', contentHash: 'hash-b' }),
    ])

    expect(pruned.map((entry) => entry.id)).toEqual(['new', 'other-model', 'other'])
  })

  it('caps history at the limit', () => {
    const many = Array.from({ length: 10 }, (_, index) => record({ id: `r${index}`, contentHash: `hash-${index}` }))

    expect(pruneRecords(many, 3)).toHaveLength(3)
  })

  it('finds a cached record only for the same skill, content and model', () => {
    const records = [
      record({ contentHash: 'hash-b' }),
      record({ id: 'wanted', contentHash: 'hash-a' }),
    ]

    expect(findRecord(records, 'file:///skill.md', 'hash-a', identity.id)?.id).toBe('wanted')
    expect(findRecord(records, 'file:///skill.md', 'hash-a', 'another-model')).toBeUndefined()
    expect(findRecord(records, 'file:///skill.md', 'missing', identity.id)).toBeUndefined()
  })

  it('labels a record by the model that produced it', () => {
    expect(recordModelLabel(record())).toBe('gpt-4o (copilot)')
  })
})
