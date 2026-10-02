import type { Finding } from '../ir/index.js'

/**
 * Two separate fields because skill text is untrusted: `skillData` must never be
 * promoted to an instruction message by a host adapter.
 */
export interface AssessmentPrompt {
  readonly instructions: string
  readonly skillData: string
}

export interface ModelIdentity {
  readonly vendor: string
  readonly family: string
  readonly id: string
}

export interface ModelClient {
  readonly identity: ModelIdentity
  complete(prompt: AssessmentPrompt, signal?: AbortSignal): Promise<string>
}

export interface AssessmentResult {
  readonly summary: string
  readonly findings: readonly Finding[]
  /** Model findings discarded because they referenced nodes that do not exist. */
  readonly rejected: number
  readonly malformed: boolean
}

export interface AssessmentOutcome extends AssessmentResult {
  readonly redactions: number
  readonly model: ModelIdentity
}
