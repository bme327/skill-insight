import type { Finding, SkillGraph } from '../ir/index.js'

export interface Rule {
  readonly id: string
  readonly pack: string
  readonly description: string
  /** Pure: same graph in, same findings out. No I/O, no clock, no randomness. */
  evaluate(graph: SkillGraph): Finding[]
}
