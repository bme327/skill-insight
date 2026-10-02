export {
  SCHEMA_VERSION,
  capabilityKindSchema,
  capabilitySchema,
  edgeKindSchema,
  emptyGraph,
  nodeKindSchema,
  parseSkillGraph,
  positionSchema,
  safeParseSkillGraph,
  skillEdgeSchema,
  skillGraphSchema,
  skillNodeSchema,
  sourceSpanSchema,
} from './schema.js'
export type {
  Capability,
  CapabilityKind,
  EdgeKind,
  NodeKind,
  Position,
  SkillEdge,
  SkillGraph,
  SkillNode,
  SourceSpan,
} from './schema.js'

export { findingSchema, hasSeverity, provenanceSchema, severitySchema, sortFindings } from './findings.js'
export type { Finding, Provenance, Severity } from './findings.js'

export {
  addEdge,
  addNode,
  entryNodes,
  findCycles,
  incoming,
  nodeById,
  outgoing,
  reachableFrom,
  removeNode,
  topologicalOrder,
  updateNode,
} from './graph.js'
export type { TopologicalOrder } from './graph.js'

export { stableId } from './ids.js'

export { resolveWithinRoot } from './path-safety.js'
export type { PathRejection, PathResolution } from './path-safety.js'
