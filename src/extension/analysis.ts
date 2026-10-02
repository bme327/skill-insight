import type { Finding, SkillGraph } from '../ir/index.js'
import { sortFindings } from '../ir/index.js'
import { createDefaultParserRegistry } from '../parsers/index.js'
import type { SkillFile } from '../parsers/index.js'
import { createDefaultRuleRegistry } from '../validation/index.js'

export interface SkillAnalysis {
  readonly graph: SkillGraph
  readonly findings: readonly Finding[]
}

const parsers = createDefaultParserRegistry()
const rules = createDefaultRuleRegistry()

export function analyzeSkill(file: SkillFile, allowedRoot: string): SkillAnalysis {
  const parsed = parsers.parse(file, { allowedRoot })
  return {
    graph: parsed.graph,
    findings: sortFindings([...parsed.findings, ...rules.run(parsed.graph)]),
  }
}

// Catalog listing needs only the graph header, so it skips the rule pass.
export function summarizeSkill(file: SkillFile, allowedRoot: string): SkillGraph {
  return parsers.parse(file, { allowedRoot }).graph
}

export function recognizesSkill(file: SkillFile): boolean {
  return parsers.recognize(file)
}