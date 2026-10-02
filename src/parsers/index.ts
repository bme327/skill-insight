export { createParserRegistry } from './registry.js'
export type { ParserRegistry } from './registry.js'
export type { ParseOptions, ParseResult, ParserAdapter, SkillFile } from './types.js'
export { createMarkdownSkillAdapter } from './markdown/adapter.js'
export { classifyStatement, isFallible, titleOf } from './markdown/classify.js'
export type { StatementKind } from './markdown/classify.js'

import { createMarkdownSkillAdapter } from './markdown/adapter.js'
import { createParserRegistry } from './registry.js'
import type { ParserRegistry } from './registry.js'

/** Convenience factory. Callers that need a different adapter set build their own registry. */
export function createDefaultParserRegistry(): ParserRegistry {
  return createParserRegistry([createMarkdownSkillAdapter()])
}
