import type { SkillGraph } from '../ir/index.js'
import { parseAssessment } from './parse.js'
import { buildAssessmentPrompt } from './prompt.js'
import type { PromptOptions } from './prompt.js'
import { redactSecrets } from './redact.js'
import type { AssessmentOutcome, ModelClient } from './types.js'

export interface AssessmentRequest extends PromptOptions {
  readonly graph: SkillGraph
  readonly client: ModelClient
  readonly signal?: AbortSignal
}

/** Redact, describe, ask, validate. The only I/O is the injected client. */
export async function assessSkill(request: AssessmentRequest): Promise<AssessmentOutcome> {
  const { graph, redactions } = redactSecrets(request.graph)
  const prompt = buildAssessmentPrompt(graph, { suspiciousNodeIds: request.suspiciousNodeIds ?? [] })
  const raw = await request.client.complete(prompt, request.signal)
  const result = parseAssessment(request.graph, raw)
  return { ...result, redactions, model: { ...request.client.identity } }
}
