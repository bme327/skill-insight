import { describe, expect, it } from 'vitest'
import { hasSeverity, sortFindings } from './findings.js'
import type { Finding, Severity } from './findings.js'

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: overrides.ruleId ?? 'rule',
    severity: overrides.severity ?? 'info',
    message: overrides.message ?? 'message',
    nodeIds: overrides.nodeIds ?? ['node'],
    ...(overrides.source === undefined ? {} : { source: overrides.source }),
    ...(overrides.provenance === undefined ? {} : { provenance: overrides.provenance }),
  }
}

describe('sortFindings', () => {
  it('orders error before warning before info regardless of input order', () => {
    const severities: readonly Severity[] = ['info', 'error', 'warning']
    const sorted = sortFindings(severities.map((severity) => finding({ severity })))

    expect(sorted.map((entry) => entry.severity)).toEqual(['error', 'warning', 'info'])
  })

  it('breaks a severity tie on ruleId', () => {
    const sorted = sortFindings([
      finding({ severity: 'warning', ruleId: 'permissions.broad' }),
      finding({ severity: 'warning', ruleId: 'action.missing' }),
    ])

    expect(sorted.map((entry) => entry.ruleId)).toEqual(['action.missing', 'permissions.broad'])
  })

  it('breaks a ruleId tie on the first nodeId', () => {
    const sorted = sortFindings([
      finding({ severity: 'error', ruleId: 'same', nodeIds: ['zeta'] }),
      finding({ severity: 'error', ruleId: 'same', nodeIds: ['alpha'] }),
    ])

    expect(sorted.map((entry) => entry.nodeIds[0])).toEqual(['alpha', 'zeta'])
  })

  it('breaks a nodeId tie on the message', () => {
    const sorted = sortFindings([
      finding({ severity: 'error', ruleId: 'same', nodeIds: ['node'], message: 'second' }),
      finding({ severity: 'error', ruleId: 'same', nodeIds: ['node'], message: 'first' }),
    ])

    expect(sorted.map((entry) => entry.message)).toEqual(['first', 'second'])
  })

  it('sorts a finding with no nodeIds through the empty-string fallback', () => {
    const empty = finding({ ruleId: 'same', nodeIds: [], message: 'empty' })
    const named = finding({ ruleId: 'same', nodeIds: ['alpha'], message: 'named' })

    expect(sortFindings([named, empty])).toEqual([empty, named])
  })

  it('returns a new array and leaves the input untouched', () => {
    const first = finding({ severity: 'info', ruleId: 'b' })
    const second = finding({ severity: 'error', ruleId: 'a' })
    const input = [first, second]

    const sorted = sortFindings(input)

    expect(sorted).not.toBe(input)
    expect(sorted).toEqual([second, first])
    expect(input).toEqual([first, second])
  })

  it('returns an empty array for empty input', () => {
    expect(sortFindings([])).toEqual([])
  })
})

describe('hasSeverity', () => {
  it('is true when a finding carries the severity', () => {
    expect(hasSeverity([finding({ severity: 'info' }), finding({ severity: 'error' })], 'error')).toBe(true)
  })

  it('is false when no finding carries the severity', () => {
    expect(hasSeverity([finding({ severity: 'info' }), finding({ severity: 'warning' })], 'error')).toBe(false)
  })

  it('is false for empty input', () => {
    expect(hasSeverity([], 'info')).toBe(false)
  })
})
