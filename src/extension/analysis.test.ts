import { describe, expect, it } from 'vitest'
import { ALLOWED_ROOT, loadFixture } from '../testing/load-fixture.js'
import { analyzeSkill } from './analysis.js'

describe('analyzeSkill', () => {
  it('returns a clean graph without findings', () => {
    const result = analyzeSkill(loadFixture('clean/SKILL.md'), ALLOWED_ROOT)

    expect(result.graph.name).toBe('release-notes')
    expect(result.findings).toEqual([])
  })

  it('combines parser and validation findings in severity order', () => {
    const result = analyzeSkill(loadFixture('adversarial/path-traversal.md'), ALLOWED_ROOT)

    expect(result.findings.map((finding) => finding.severity)).toEqual([
      'error',
      'error',
      'warning',
      'warning',
      'warning',
    ])
    expect(result.findings.map((finding) => finding.ruleId)).toContain(
      'permissions/destructive-action',
    )
  })
})