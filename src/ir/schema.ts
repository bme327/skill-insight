import { z } from 'zod'

/** Bumping this requires a migration in `migrations.ts`. */
export const SCHEMA_VERSION = '1.0.0'

export const positionSchema = z.object({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
  offset: z.number().int().min(0),
})

export const sourceSpanSchema = z.object({
  uri: z.string().min(1),
  start: positionSchema,
  end: positionSchema,
})

export const nodeKindSchema = z.enum([
  'trigger',
  'input',
  'instruction',
  'condition',
  'action',
  'toolCall',
  'permission',
  'validation',
  'output',
  'errorPath',
  'reference',
])

export const capabilityKindSchema = z.enum(['tool', 'file', 'network', 'secret', 'process'])

/**
 * What a node reaches for. `declared` records whether the skill announced it up front;
 * whether that is acceptable is a rule's judgement, not data.
 */
export const capabilitySchema = z.object({
  kind: capabilityKindSchema,
  value: z.string().min(1),
  declared: z.boolean(),
})

export const skillNodeSchema = z.object({
  id: z.string().min(1),
  kind: nodeKindSchema,
  title: z.string(),
  detail: z.string(),
  source: sourceSpanSchema,
  capabilities: z.array(capabilitySchema),
  inferred: z.boolean(),
  confidence: z.number().min(0).max(1),
  raw: z.record(z.unknown()),
})

export const edgeKindSchema = z.enum(['then', 'else', 'onError', 'dataFlow'])

export const skillEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: edgeKindSchema,
  label: z.string(),
})

const skillGraphShape = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  provider: z.string().min(1),
  sourceUri: z.string().min(1),
  declaredTools: z.array(z.string()),
  nodes: z.array(skillNodeSchema),
  edges: z.array(skillEdgeSchema),
  raw: z.record(z.unknown()),
})

export const skillGraphSchema = skillGraphShape.superRefine((graph, ctx) => {
  const ids = new Set<string>()
  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate node id: ${node.id}`, path: ['nodes'] })
    }
    ids.add(node.id)
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.from)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `edge ${edge.id} has unknown source: ${edge.from}`, path: ['edges'] })
    }
    if (!ids.has(edge.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `edge ${edge.id} has unknown target: ${edge.to}`, path: ['edges'] })
    }
  }
})

export type Position = z.infer<typeof positionSchema>
export type SourceSpan = z.infer<typeof sourceSpanSchema>
export type NodeKind = z.infer<typeof nodeKindSchema>
export type CapabilityKind = z.infer<typeof capabilityKindSchema>
export type Capability = z.infer<typeof capabilitySchema>
export type SkillNode = z.infer<typeof skillNodeSchema>
export type EdgeKind = z.infer<typeof edgeKindSchema>
export type SkillEdge = z.infer<typeof skillEdgeSchema>
export type SkillGraph = z.infer<typeof skillGraphShape>

/** Parses untrusted graph data. Throws only on programmer error at a trust boundary. */
export function parseSkillGraph(value: unknown): SkillGraph {
  return skillGraphSchema.parse(value)
}

export function safeParseSkillGraph(value: unknown): z.SafeParseReturnType<unknown, SkillGraph> {
  return skillGraphSchema.safeParse(value)
}

export function emptyGraph(init: {
  id: string
  name: string
  provider: string
  sourceUri: string
  description?: string
}): SkillGraph {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: init.id,
    name: init.name,
    description: init.description ?? '',
    provider: init.provider,
    sourceUri: init.sourceUri,
    declaredTools: [],
    nodes: [],
    edges: [],
    raw: {},
  }
}
