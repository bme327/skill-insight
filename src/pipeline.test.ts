import { describe, expect, it } from 'vitest'
import { createDefaultParserRegistry } from './parsers/index.js'
import { ALLOWED_ROOT, loadFixture } from './testing/load-fixture.js'
import { createDefaultRuleRegistry } from './validation/index.js'

const parsers = createDefaultParserRegistry()
const rules = createDefaultRuleRegistry()

function analyse(fixture: string) {
  const file = loadFixture(fixture)
  const { graph, findings } = parsers.parse(file, { allowedRoot: ALLOWED_ROOT })
  return { graph, findings: [...findings, ...rules.run(graph)] }
}

describe('analysis pipeline', () => {
  // The anchor case: a well-formed skill must produce a silent report.
  it('reports nothing for a clean skill', () => {
    const { findings } = analyse('clean/SKILL.md')
    expect(findings).toEqual([])
  })

  it('reports nothing for the preview-build skill', () => {
    const { findings } = analyse('preview-build/SKILL.md')
    expect(findings.map((finding) => finding.ruleId)).toEqual([])
  })

  it('reports every unsafe reference and the destructive command', () => {
    const { findings } = analyse('adversarial/path-traversal.md')
    const ids = findings.map((finding) => finding.ruleId)
    expect(ids.filter((id) => id === 'references/broken-reference')).toHaveLength(2)
    expect(ids).toContain('permissions/destructive-action')
  })

  it('reports the injection attempt exactly once', () => {
    const { findings } = analyse('adversarial/injection.md')
    expect(findings.filter((finding) => finding.ruleId === 'security/prompt-injection')).toHaveLength(2)
  })

  it('is deterministic across repeated runs', () => {
    expect(analyse('preview-build/SKILL.md').findings).toEqual(analyse('preview-build/SKILL.md').findings)
  })
})
