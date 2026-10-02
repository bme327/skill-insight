import { describe, expect, it } from 'vitest'
import { testGraph } from '../testing/graph-builder.js'
import { hostMessageSchema, webviewMessageSchema } from './messages.js'

describe('webview message schemas', () => {
  it('accepts a graph produced by the core', () => {
    const message = { type: 'analysis', graph: testGraph([]), findings: [] }
    expect(hostMessageSchema.safeParse(message).success).toBe(true)
  })

  it('validates assessment status and requests', () => {
    expect(hostMessageSchema.safeParse({ type: 'assessment', state: 'ready', modelLabel: 'GPT-4o (copilot)' }).success).toBe(true)
    expect(hostMessageSchema.safeParse({ type: 'assessment', state: 'running' }).success).toBe(true)
    expect(hostMessageSchema.safeParse({ type: 'assessment', state: 'thinking' }).success).toBe(false)
    expect(webviewMessageSchema.safeParse({ type: 'runAssessment' }).success).toBe(true)
    expect(webviewMessageSchema.safeParse({ type: 'runAssessment', force: true }).success).toBe(true)
    expect(webviewMessageSchema.safeParse({ type: 'runAssessment', force: 'yes' }).success).toBe(false)
  })

  it('carries AI provenance on a finding', () => {
    const message = {
      type: 'analysis',
      graph: testGraph([]),
      findings: [{ ruleId: 'ai/clarity', severity: 'warning', message: 'Unclear.', nodeIds: [], provenance: 'ai' }],
    }
    expect(hostMessageSchema.safeParse(message).success).toBe(true)
  })

  it('rejects an unvalidated reveal request', () => {
    expect(webviewMessageSchema.safeParse({ type: 'revealSource', source: '../../secret' }).success).toBe(false)
  })

  it('accepts the webview ready handshake', () => {
    expect(webviewMessageSchema.safeParse({ type: 'ready' }).success).toBe(true)
  })

  it('validates catalog updates and skill selection', () => {
    const catalog = {
      type: 'catalog',
      groups: [{
        id: 'workspace', label: 'Workspace', kind: 'workspace',
        skills: [{ uri: 'file:///skill.md', name: 'Skill', description: '', path: 'skill.md' }],
      }],
      selectedUri: 'file:///skill.md',
    }
    expect(hostMessageSchema.safeParse(catalog).success).toBe(true)
    expect(webviewMessageSchema.safeParse({ type: 'selectSkill', uri: 'file:///skill.md' }).success).toBe(true)
    expect(webviewMessageSchema.safeParse({ type: 'selectSkill', uri: '' }).success).toBe(false)
  })

  it('validates scan status updates', () => {
    expect(hostMessageSchema.safeParse({ type: 'status', scanning: true, scanned: 12, total: 401 }).success).toBe(true)
    expect(hostMessageSchema.safeParse({ type: 'status', scanning: false, scanned: 0, total: 0 }).success).toBe(true)
    expect(hostMessageSchema.safeParse({ type: 'status', scanning: true, scanned: -1, total: 4 }).success).toBe(false)
    expect(hostMessageSchema.safeParse({ type: 'status', scanning: true, scanned: 1.5, total: 4 }).success).toBe(false)
  })

  it('validates filter synchronisation in both directions', () => {
    expect(hostMessageSchema.safeParse({ type: 'filter', value: 'review' }).success).toBe(true)
    expect(hostMessageSchema.safeParse({ type: 'filter', value: '' }).success).toBe(true)
    expect(webviewMessageSchema.safeParse({ type: 'setFilter', value: 'review' }).success).toBe(true)
    expect(webviewMessageSchema.safeParse({ type: 'setFilter', value: 'x'.repeat(201) }).success).toBe(false)
  })
})