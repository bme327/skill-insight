import { emptyGraph, stableId } from '../ir/index.js'
import type { ParseOptions, ParseResult, ParserAdapter, SkillFile } from './types.js'

export interface ParserRegistry {
  readonly adapters: readonly ParserAdapter[]
  detect(file: SkillFile): ParserAdapter | undefined
  recognize(file: SkillFile): boolean
  parse(file: SkillFile, options: ParseOptions): ParseResult
}

/**
 * Adapters are supplied by the caller; adding a provider never means editing this file.
 */
export function createParserRegistry(adapters: readonly ParserAdapter[]): ParserRegistry {
  const frozen = Object.freeze([...adapters])

  const detect = (file: SkillFile): ParserAdapter | undefined =>
    frozen.find((adapter) => adapter.detect(file))

  return {
    adapters: frozen,
    detect,
    recognize(file) {
      return detect(file)?.recognize(file) ?? false
    },
    parse(file, options) {
      const adapter = detect(file)
      if (adapter === undefined) {
        return {
          graph: emptyGraph({
            id: stableId('skill', file.uri),
            name: '',
            provider: 'unknown',
            sourceUri: file.uri,
          }),
          findings: [
            {
              ruleId: 'parse/unsupported-format',
              severity: 'error',
              message: `No parser recognised ${file.uri}.`,
              nodeIds: [],
            },
          ],
        }
      }
      return adapter.parse(file, options)
    },
  }
}
