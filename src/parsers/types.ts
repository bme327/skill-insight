import type { Finding, SkillGraph } from '../ir/index.js'

export interface SkillFile {
  /** Opaque identifier for the source. The parser never resolves or opens it. */
  readonly uri: string
  readonly content: string
}

export interface ParseOptions {
  /** References inside the skill are resolved against this root and rejected if they escape it. */
  readonly allowedRoot: string
}

export interface ParseResult {
  readonly graph: SkillGraph
  readonly findings: readonly Finding[]
}

export interface ParserAdapter {
  readonly id: string
  readonly provider: string
  detect(file: SkillFile): boolean
  /** Returns whether the file contains the provider's minimum identifying structure. */
  recognize(file: SkillFile): boolean
  /** Never throws on malformed input: returns a graph plus findings describing the damage. */
  parse(file: SkillFile, options: ParseOptions): ParseResult
}
